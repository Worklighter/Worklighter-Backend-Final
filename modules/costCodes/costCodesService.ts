import { HttpStatusCode } from 'axios';
import { ObjectId } from 'mongodb';
import * as fs from 'fs';
import CostCodesRepository from './costCodesRepository';
import CostCodesModel from './costCodesModel';
import { 
    ICostCode,
    ICreateCostCodeDTO,
    IUpdateCostCodeDTO,
    IListCostCodesDTO,
    ICostCodesPaginatedResult,
    IImportCostCodesResponse,
    CostCodeType,
    listCostCodesResponseFields,
    optimizedCostCodeResponseFields,
    ICostCodeWithCompany
} from './costCodesInterface';
import { CustomError } from '../../core/errors/custom';
import { Utils } from '../../utils/utils';
import  OnboardingRepository  from '../users/usersRepository';
import QueryOperators from '../../core/enums/queryOperators';
import { ICompany } from '../company/companyInterface';
import KnowledgeBaseService from '../knowledgeBase/knowledgeBaseService';
import KnowledgeBaseRepository from '../knowledgeBase/knowledgeBaseRepository';
import { Logger } from '../../utils/helpers/logger';

/*
 * ╔═══════════════════════════════════════╗
 * ║       COST CODES SERVICE              ║
 * ╚═══════════════════════════════════════╝
 */

class CostCodesService {
    private static instance: CostCodesService;
    private repository: CostCodesRepository;

    private constructor() {
        this.repository = CostCodesRepository.getInstance();
    }

    public static getInstance(): CostCodesService {
        if (!CostCodesService.instance) {
            CostCodesService.instance = new CostCodesService();
        }
        return CostCodesService.instance;
    }

    /*
     * List cost codes with search and pagination
     */
    public async listCostCodes(
        dto: IListCostCodesDTO,
        userId: string,
        tenantId: string
    ): Promise<ICostCodesPaginatedResult> {
        const { searchText, continuationToken = 1, pageSize = 15 } = dto;

        const queryParams: any[] = [
            { param: 'deletedAt', value: null, operator: QueryOperators.AND },
            { param: 'isActive', value: true, operator: QueryOperators.AND },
            { param: 'tenantId', value: ['system', tenantId], operator: QueryOperators.AND, operationType: 'in' }
        ];

        if (searchText && searchText.trim()) {
            const normalizedSearch = this.normalizeCodeNumber(searchText.trim());
            queryParams.push({ param: 'codeNumber', value: normalizedSearch, operator: QueryOperators.OR, operationType: 'contains', caseSensitive: false });
        }
        console.log('CostCodesService:listCostCodes', { searchText, continuationToken, pageSize });
        const [result, total] = await Promise.all([
            this.repository.GetAll(queryParams, true, continuationToken, pageSize, { codeNumber: 1 }, listCostCodesResponseFields) as any,
            this.repository.Count(queryParams)
        ]);

        const codes: ICostCode[] = result.data || [];

        if (codes.length > 0) {
            const hashes = codes.map(c => `code:cost_code:${tenantId}:${String((c as any)._id)}`);
            const kbRecords = await KnowledgeBaseRepository.getInstance().collection
                .find({ hash: { $in: hashes }, tenantId, deletedAt: null })
                .project({ hash: 1, ingestionStatus: 1 })
                .toArray() as { hash: string; ingestionStatus: string }[];

            const statusByHash = new Map(kbRecords.map(r => [r.hash, r.ingestionStatus]));

            for (const code of codes) {
                const hash = `code:cost_code:${tenantId}:${String((code as any)._id)}`;
                (code as any).vectorIngestionStatus = statusByHash.get(hash) ?? null;
            }
        }

        const enrichedData = await this.enrichMultipleWithCompanyInfo(codes, userId, tenantId);

        // The repository treats continuationToken as a page number, not an
        // item offset. Preserve the repository's next-page token so page 1
        // returns "2", page 2 returns "3", etc.
        const nextContinuationToken = result.continuationToken ?? null;
        const lastPage = nextContinuationToken === null;

        return Utils.pagination(lastPage, enrichedData, nextContinuationToken, total) as ICostCodesPaginatedResult;
    }

    /*
     * Get a single cost code by ID
     */
    public async getCostCodeById(id: string, tenantId: string, userId: string = 'N/A'): Promise<ICostCodeWithCompany> {
        if (!ObjectId.isValid(id)) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Invalid cost code ID');
        }

        const costCode = await this.repository.GetById(
            id,
            optimizedCostCodeResponseFields
        ) as ICostCode;

        if (!costCode || costCode.deletedAt) {
            throw new CustomError(HttpStatusCode.NotFound, 'Cost code not found');
        }

        // Check access: system codes accessible to all, custom codes only to owner tenant
        if (costCode.tenantId !== 'system' && costCode.tenantId !== tenantId) {
            throw new CustomError(HttpStatusCode.Forbidden, 'Access denied');
        }

        return await this.enrichWithCompanyInfo(costCode, userId, tenantId);
    }

    /*
     * Create a new cost code (custom only)
     */
    public async createCostCode(
        dto: ICreateCostCodeDTO,
        userId: string,
        tenantId: string
    ): Promise<ICostCodeWithCompany> {
        const { codeNumber, category, description } = dto;

        // Check for duplicate code number within tenant
        await this.checkDuplicateCode(codeNumber, tenantId);

        // Create new cost code
        const newCostCode: Partial<ICostCode> = {
            codeNumber,
            category,
            description,
            type: CostCodeType.CUSTOM,
            tenantId,
            isActive: true,
            createdAt: Utils.getCurrentDate(),
            createdBy: userId,
            updatedAt: null,
            updatedBy: null,
            deletedAt: null
        };

        const costCodeModel = CostCodesModel.create(newCostCode as any);
        const createdCode = await this.repository.Add(costCodeModel, optimizedCostCodeResponseFields) as ICostCode;
        await this.addCodeToKnowledgeBase(createdCode, userId, tenantId);
        
        return await this.enrichWithCompanyInfo(createdCode, userId, tenantId);
    }

    /*
     * Update a cost code (both standard and custom)
     */
    public async updateCostCode(
        id: string,
        dto: IUpdateCostCodeDTO,
        userId: string,
        tenantId: string
    ): Promise<ICostCodeWithCompany> {
        // Get existing cost code
        const existingCode = await this.getCostCodeById(id, tenantId);

        // If updating code number, check for duplicates
        if (dto.codeNumber && dto.codeNumber !== existingCode.codeNumber) {
            await this.checkDuplicateCode(dto.codeNumber, existingCode.tenantId, id);
        }

        // Prepare update data
        const updateData: Partial<ICostCode> = {
            ...dto,
            updatedAt: Utils.getCurrentDate(),
            updatedBy: userId
        };

        // Update in database
        await this.repository.Update(new ObjectId(id), updateData);
        const updatedCode = await this.getCostCodeById(id, tenantId, userId);
        await this.updateCodeInKnowledgeBase(updatedCode, userId, tenantId);

        return updatedCode;
    }

    /*
     * Delete a cost code (soft delete, custom codes only)
     */
    public async deleteCostCode(
        id: string,
        userId: string,
        tenantId: string
    ): Promise<{ message: string }> {
        // Get existing cost code
        const existingCode = await this.getCostCodeById(id, tenantId);

        // Prevent deletion of standard codes
        if (existingCode.type === CostCodeType.STANDARD) {
            throw new CustomError(
                HttpStatusCode.Forbidden,
                'Standard cost codes cannot be deleted'
            );
        }

        // Soft delete
        await this.repository.Update(new ObjectId(id), {
            deletedAt: Utils.getCurrentDate(),
            updatedBy: userId
        });
        await this.deleteCodeFromKnowledgeBase(existingCode, userId, tenantId);

        return { message: 'Cost code deleted successfully' };
    }

        private readUploadedCSV(file: Express.Multer.File): string {
        if (file?.buffer) {
            return file.buffer.toString('utf-8');
        }

        if (file?.path) {
            return fs.readFileSync(file.path, 'utf-8');
        }

        throw new CustomError(HttpStatusCode.BadRequest, 'CSV file content is missing');
    }

    private cleanupUploadedFile(file: Express.Multer.File): void {
        if (file?.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    }

    private async addCodeToKnowledgeBase(code: ICostCode, userId: string, tenantId: string): Promise<void> {
        try {
            await KnowledgeBaseService.getInstance().createCodeKBEntry({
                codeNumber: code.codeNumber,
                category: code.category,
                description: code.description,
                codeType: 'cost_code',
                userId,
                tenantId,
                sourceId: String((code as any)._id || code.codeNumber),
            });
        } catch (error: any) {
            Logger.Console(`Cost code KB enqueue skipped for ${code.codeNumber}: ${error?.message || error}`, 'warn');
        }
    }

    private async deleteCodeFromKnowledgeBase(code: ICostCode, userId: string, tenantId: string): Promise<void> {
        try {
            await KnowledgeBaseService.getInstance().deleteCodeKBEntry({
                codeType: 'cost_code',
                sourceId: String((code as any)._id || code.codeNumber),
                userId,
                tenantId,
            });
        } catch (error: any) {
            Logger.Console(`Cost code KB delete skipped for ${code.codeNumber}: ${error?.message || error}`, 'warn');
        }
    }

    private async updateCodeInKnowledgeBase(code: ICostCode, userId: string, tenantId: string): Promise<void> {
        try {
            await KnowledgeBaseService.getInstance().updateCodeKBEntry({
                codeNumber: code.codeNumber,
                category: code.category,
                description: code.description,
                codeType: 'cost_code',
                userId,
                tenantId,
                sourceId: String((code as any)._id || code.codeNumber),
            });
        } catch (error: any) {
            Logger.Console(`Cost code KB update skipped for ${code.codeNumber}: ${error?.message || error}`, 'warn');
        }
    }

    /*
     * Import cost codes from CSV.
     * Supports memory storage (file.buffer) and disk storage (file.path).
     */
    public async importFromCSV(
        file: Express.Multer.File,
        userId: string,
        tenantId: string
    ): Promise<IImportCostCodesResponse> {
        try {
            const content = this.readUploadedCSV(file);
            const lines = content.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                this.cleanupUploadedFile(file);
                throw new CustomError(HttpStatusCode.BadRequest, 'CSV file is empty or has no data rows');
            }

            // Parse header using ETL logic
            const headers = this.parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
            
            // Validate headers
            const requiredHeaders = ['code_number', 'category', 'description'];
            const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
            
            if (missingHeaders.length > 0) {
                this.cleanupUploadedFile(file);
                throw new CustomError(
                    HttpStatusCode.BadRequest,
                    `CSV missing required headers: ${missingHeaders.join(', ')}`
                );
            }

            const codeNumberIndex = headers.indexOf('code_number');
            const categoryIndex = headers.indexOf('category');
            const descriptionIndex = headers.indexOf('description');

            // Process each row with strict validation
            const results: IImportCostCodesResponse = {
                success: 0,
                failed: 0,
                total: lines.length - 1,
                imported: [],
                errors: []
            };

            for (let i = 1; i < lines.length; i++) {
                const rowNumber = i + 1;
                const values = this.parseCSVLine(lines[i]);

                try {
                    // Extract and clean values
                    const codeNumber = values[codeNumberIndex]?.trim();
                    const category = values[categoryIndex]?.trim();
                    const description = values[descriptionIndex]?.trim();

                    // STRICT VALIDATION: All fields must be present
                    if (!codeNumber) {
                        results.failed++;
                        results.errors.push({
                            row: rowNumber,
                            codeNumber: 'N/A',
                            error: 'Missing code_number'
                        });
                        continue;
                    }

                    if (!category) {
                        results.failed++;
                        results.errors.push({
                            row: rowNumber,
                            codeNumber,
                            error: 'Missing category'
                        });
                        continue;
                    }

                    if (!description) {
                        results.failed++;
                        results.errors.push({
                            row: rowNumber,
                            codeNumber,
                            error: 'Missing description'
                        });
                        continue;
                    }

                    // Check for duplicate
                    const isDuplicate = await this.isDuplicateCode(codeNumber, tenantId);
                    if (isDuplicate) {
                        results.failed++;
                        results.errors.push({
                            row: rowNumber,
                            codeNumber,
                            error: 'Duplicate code number'
                        });
                        continue;
                    }

                    // Create cost code (marked as CUSTOM)
                    const newCode: Partial<ICostCode> = {
                        codeNumber,
                        category,
                        description,
                        type: CostCodeType.CUSTOM, // Always mark as custom
                        tenantId,
                        isActive: true,
                        createdAt: Utils.getCurrentDate(),
                        createdBy: userId,
                        updatedAt: null,
                        updatedBy: null,
                        deletedAt: null
                    };

                    const costCodeModel = CostCodesModel.create(newCode as any);
                    const createdCode = await this.repository.Add(costCodeModel, optimizedCostCodeResponseFields) as ICostCode;
                    await this.addCodeToKnowledgeBase(createdCode, userId, tenantId);
                    
                    results.success++;
                    const enrichedCode = await this.enrichWithCompanyInfo(createdCode, userId, tenantId);
                    results.imported.push(enrichedCode);

                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        row: rowNumber,
                        codeNumber: values[codeNumberIndex] || 'N/A',
                        error: error.message || 'Unknown error'
                    });
                }
            }

            // Clean up the uploaded file after processing
            this.cleanupUploadedFile(file);

            return results;

        } catch (error) {
            // Clean up file if it exists
            this.cleanupUploadedFile(file);
            
            // Handle any top-level errors
            throw new CustomError(
                HttpStatusCode.InternalServerError,
                `CSV import failed: ${error.message}`
            );
        }
    }

    /*
     * Generate CSV template for download
     */
    public async downloadTemplate(): Promise<Buffer> {
        // Use explicit string formatting: ="value" forces Excel to treat as text
        // without showing quotes or apostrophes in the cell
        const headers = 'code_number,category,description\n';
        const sampleRows = [
            '="03-30-00",Concrete,Cast-in-Place Concrete',
            '="05-12-00",Metals,Structural Steel Framing',
            '="06-10-00","Wood & Plastics",Rough Carpentry'
        ].join('\n');

        return Buffer.from(headers + sampleRows, 'utf-8');
    }

    /*
     * ╔═══════════════════════════════════════╗
     * ║          HELPER METHODS               ║
     * ╚═══════════════════════════════════════╝
     */

    /*
     * Normalize code number for flexible search
     * "03-30-00" → "033000"
     */
    private normalizeCodeNumber(code: string): string {
        return code.replace(/-/g, '');
    }

    /*
     * Check if code number already exists for tenant
     */
    private async checkDuplicateCode(
        codeNumber: string,
        tenantId: string,
        excludeId?: string
    ): Promise<void> {
        const queryParams: any[] = [
            { param: 'codeNumber', value: codeNumber, operator: QueryOperators.AND },
            { param: 'tenantId', value: tenantId, operator: QueryOperators.AND },
            { param: 'deletedAt', value: null, operator: QueryOperators.AND }
        ];

        const existing = await this.repository.GetOneByParams(queryParams, ['_id']) as ICostCode;

        if (existing && (!excludeId || existing._id.toString() !== excludeId)) {
            throw new CustomError(
                HttpStatusCode.Conflict,
                `Cost code ${codeNumber} already exists`
            );
        }
    }

    /*
     * Check if code number is duplicate (returns boolean)
     */
    private async isDuplicateCode(codeNumber: string, tenantId: string): Promise<boolean> {
        console.log(codeNumber, tenantId);
        
        const queryParams: any[] = [
            { param: 'codeNumber', value: codeNumber, operator: QueryOperators.AND },
            { param: 'tenantId', value: tenantId, operator: QueryOperators.AND },
            { param: 'deletedAt', value: null, operator: QueryOperators.AND }
        ];

        const existing = await this.repository.GetOneByParams(queryParams, ['_id']);
        return !!existing;
    }

    /*
     * Parse CSV line handling quoted values (from ETL DocumentETLService)
     * Handles commas inside quotes properly
     */
    private parseCSVLine(line: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    /*
     * Add company information to cost code
     */
    private async enrichWithCompanyInfo(
        costCode: ICostCode,
        userId: string,
        tenantId: string
    ): Promise<ICostCodeWithCompany> {
        // For system codes, no company info needed
        if (costCode.tenantId === 'system') {
            console.log('System code - skipping company lookup');
            return {
                ...costCode,
                companyId: null,
                userId
            };
        }

        try {
            // Try lookup by tenantId
            const onboarding: ICompany | undefined = await OnboardingRepository.getInstance().GetOneByParams(
                [{ param: 'tenantId', value: tenantId, operator: QueryOperators.AND }],
                ['_id', 'tenantId', 'userId']
            );

            console.log('Onboarding lookup result:', onboarding);

            if (!onboarding) {
                console.log('No onboarding found for tenantId:', tenantId);
            }

            return {
                ...costCode,
                companyId: onboarding?._id?.toString() || null,
                userId
            };
        } catch (error) {
            console.error('Error in enrichWithCompanyInfo:', error);
            return {
                ...costCode,
                companyId: null,
                userId
            };
        }
    }

    /*
     * Add company information to multiple cost codes
     */
    private async enrichMultipleWithCompanyInfo(
        costCodes: ICostCode[],
        userId: string,
        tenantId: string
    ): Promise<ICostCodeWithCompany[]> {
        try {
            const onboarding = await OnboardingRepository.getInstance().GetOneByParams(
                [{ param: 'tenantId', value: tenantId, operator: QueryOperators.AND }],
                ['_id', 'tenantId']
            ) as ICompany;

            const companyId = onboarding?._id?.toString() || null;

            return costCodes.map(costCode => ({
                ...costCode,
                companyId: costCode.tenantId === 'system' ? null : companyId,
                userId
            }));
        } catch (error) {
            console.error('Error in enrichMultipleWithCompanyInfo:', error);
            return costCodes.map(costCode => ({
                ...costCode,
                companyId: null,
                userId
            }));
        }
    }
}





















































export default CostCodesService;

