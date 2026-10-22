import { HttpStatusCode } from 'axios';
import { ObjectId } from 'mongodb';
import * as fs from 'fs';
import WCCodesRepository from './wcCodesRepository';
import WCCodesModel from './wcCodesModel';
import { 
    IWCCode,
    ICreateWCCodeDTO,
    IUpdateWCCodeDTO,
    IListWCCodesDTO,
    IWCCodesPaginatedResult,
    IImportWCCodesResponse,
    WCCodeType,
    listWCCodesResponseFields,
    optimizedWCCodeResponseFields
} from './wcCodesInterface';
import { CustomError } from '../../core/errors/custom';
import { Utils } from '../../utils/utils';
import QueryOperators from '../../core/enums/queryOperators';
import KnowledgeBaseService from '../knowledgeBase/knowledgeBaseService';
import KnowledgeBaseRepository from '../knowledgeBase/knowledgeBaseRepository';
import { Logger } from '../../utils/helpers/logger';
import IJWTPayload from '../../core/interfaces/jwt';
import { createHash } from 'crypto';

/*
 * ╔═══════════════════════════════════════╗
 * ║       WC CODES SERVICE                ║
 * ╚═══════════════════════════════════════╝
 */

class WCCodesService {
    private static instance: WCCodesService;
    private repository: WCCodesRepository;

    private constructor() {
        this.repository = WCCodesRepository.getInstance();
    }

    public static getInstance(): WCCodesService {
        if (!WCCodesService.instance) {
            WCCodesService.instance = new WCCodesService();
        }
        return WCCodesService.instance;
    }

    /*
     * List WC codes with search and pagination
     */
    public async listWCCodes(
        dto: IListWCCodesDTO,
        loggedInUser: IJWTPayload
    ): Promise<IWCCodesPaginatedResult> {
        const tenantId = loggedInUser.tenantId;
        const { searchText, continuationToken, pageSize } = dto;

        const queryParams: any[] = [
            { param: 'deletedAt', value: null, operator: QueryOperators.AND },
            { param: 'isActive', value: true, operator: QueryOperators.AND },
            { param: 'tenantId', value: tenantId, operator: QueryOperators.AND }
        ];

        if (searchText && searchText.trim()) {
            const search = searchText.trim();
            queryParams.push({ param: 'codeNumber', value: search, operator: QueryOperators.OR, operationType: 'contains', caseSensitive: false });
            queryParams.push({ param: 'category', value: search, operator: QueryOperators.OR, operationType: 'contains', caseSensitive: false });
            queryParams.push({ param: 'description', value: search, operator: QueryOperators.OR, operationType: 'contains', caseSensitive: false });
        }

        const [result, total] = await Promise.all([
            this.repository.GetAll(queryParams, true, continuationToken, pageSize, { codeNumber: 1 }, listWCCodesResponseFields) as any,
            this.repository.Count(queryParams)
        ]);

        const codes: IWCCode[] = result.data || [];

        // Batch-fetch KB ingestion statuses for this page of codes in one query
        if (codes.length > 0) {
            const hashes = codes.map(c => `code:wc_code:${tenantId}:${String((c as any)._id)}`);
            const kbRecords = await KnowledgeBaseRepository.getInstance().collection
                .find({ hash: { $in: hashes }, tenantId, deletedAt: null })
                .project({ hash: 1, ingestionStatus: 1 })
                .toArray() as { hash: string; ingestionStatus: string }[];

            const statusByHash = new Map(kbRecords.map(r => [r.hash, r.ingestionStatus]));

            for (const code of codes) {
                const hash = `code:wc_code:${tenantId}:${String((code as any)._id)}`;
                (code as any).vectorIngestionStatus = statusByHash.get(hash) ?? null;
            }
        }

        // The repository treats continuationToken as a page number, not an
        // item offset. Preserve the repository's next-page token so page 1
        // returns "2", page 2 returns "3", etc.
        const nextContinuationToken = result.continuationToken ?? null;
        const lastPage = nextContinuationToken === null;

        return Utils.pagination(lastPage, codes, nextContinuationToken, total) as IWCCodesPaginatedResult;
    }

    /*
     * Get a single WC code by ID
     */
    public async getWCCodeById(id: string, tenantId: string): Promise<IWCCode> {
        if (!ObjectId.isValid(id)) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Invalid WC code ID');
        }

        const wcCode = await this.repository.GetById(
            id,
            optimizedWCCodeResponseFields
        ) as IWCCode;

        if (!wcCode || wcCode.deletedAt) {
            throw new CustomError(HttpStatusCode.NotFound, 'WC code not found');
        }

        // Check access: system codes accessible to all, custom codes only to owner tenant
        if (wcCode.tenantId !== 'system' && wcCode.tenantId !== tenantId) {
            throw new CustomError(HttpStatusCode.Forbidden, 'Access denied');
        }

        return wcCode;
    }

    /*
     * Create a new WC code (custom only)
     */
    public async createWCCode(
        dto: ICreateWCCodeDTO,
        userId: string,
        tenantId: string,
    ): Promise<IWCCode> {
        const { codeNumber, category, description } = dto;

        await this.checkDuplicateCode(codeNumber, description, tenantId);

        const newWCCode: Partial<IWCCode> = {
            codeNumber,
            category,
            description,
            duplicateHash: this.buildDuplicateHash(codeNumber, description),
            type: WCCodeType.CUSTOM,
            tenantId,
            userId,
            isActive: true,
            createdAt: new Date(Utils.getCurrentDate()),
            createdBy: userId,
            updatedAt: null,
            updatedBy: null,
            deletedAt: null
        };

        const wcCodeModel = WCCodesModel.create(newWCCode);
        const createdCode = await this.repository.Add(wcCodeModel, optimizedWCCodeResponseFields) as IWCCode;
        await this.addCodeToKnowledgeBase(createdCode, userId, tenantId);
        
        return createdCode;
    }

    /*
     * Update a WC code (both standard and custom)
     */
    public async updateWCCode(
        id: string,
        dto: IUpdateWCCodeDTO,
        userId: string,
        tenantId: string
    ): Promise<IWCCode> {
        // Get existing WC code
        const existingCode = await this.getWCCodeById(id, tenantId);

        const newCodeNumber = dto.codeNumber ?? existingCode.codeNumber;
        const newDescription = dto.description ?? existingCode.description;
        const hashChanged = newCodeNumber !== existingCode.codeNumber || newDescription !== existingCode.description;

        if (hashChanged) {
            await this.checkDuplicateCode(newCodeNumber, newDescription, existingCode.tenantId, id);
        }

        const updateData: Partial<IWCCode> = {
            ...dto,
            ...(hashChanged ? { duplicateHash: this.buildDuplicateHash(newCodeNumber, newDescription) } : {}),
            updatedAt: new Date(Utils.getCurrentDate()),
            updatedBy: userId
        };

        // Update in database
        await this.repository.Update(new ObjectId(id), updateData);
        const updatedCode = await this.getWCCodeById(id, tenantId);
        await this.updateCodeInKnowledgeBase(updatedCode, userId, tenantId);

        return updatedCode;
    }

    /*
     * Delete a WC code (soft delete, custom codes only)
     */
    public async deleteWCCode(
        id: string,
        userId: string,
        tenantId: string
    ): Promise<{ message: string }> {
        // Get existing WC code
        const existingCode = await this.getWCCodeById(id, tenantId);

        // Prevent deletion of standard codes
        if (existingCode.type === WCCodeType.STANDARD) {
            throw new CustomError(
                HttpStatusCode.Forbidden,
                'Industry-standard WC codes cannot be deleted'
            );
        }

        // Soft delete
        await this.repository.Update(new ObjectId(id), {
            deletedAt: Utils.getCurrentDate(),
            updatedBy: userId
        });
        await this.deleteCodeFromKnowledgeBase(existingCode, userId, tenantId);

        return { message: 'WC code deleted successfully' };
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

    private async addCodeToKnowledgeBase(code: IWCCode, userId: string, tenantId: string): Promise<void> {
        try {
            await KnowledgeBaseService.getInstance().createCodeKBEntry({
                codeNumber: code.codeNumber,
                category: code.category,
                description: code.description,
                codeType: 'wc_code',
                userId,
                tenantId,
                sourceId: String((code as any)._id || code.codeNumber),
            });
        } catch (error: any) {
            Logger.Console(`WC code KB enqueue skipped for ${code.codeNumber}: ${error?.message || error}`, 'warn');
        }
    }

    private async deleteCodeFromKnowledgeBase(code: IWCCode, userId: string, tenantId: string): Promise<void> {
        try {
            await KnowledgeBaseService.getInstance().deleteCodeKBEntry({
                codeType: 'wc_code',
                sourceId: String((code as any)._id || code.codeNumber),
                userId,
                tenantId,
            });
        } catch (error: any) {
            Logger.Console(`WC code KB delete skipped for ${code.codeNumber}: ${error?.message || error}`, 'warn');
        }
    }

    private async updateCodeInKnowledgeBase(code: IWCCode, userId: string, tenantId: string): Promise<void> {
        try {
            await KnowledgeBaseService.getInstance().updateCodeKBEntry({
                codeNumber: code.codeNumber,
                category: code.category,
                description: code.description,
                codeType: 'wc_code',
                userId,
                tenantId,
                sourceId: String((code as any)._id || code.codeNumber),
            });
        } catch (error: any) {
            Logger.Console(`WC code KB update skipped for ${code.codeNumber}: ${error?.message || error}`, 'warn');
        }
    }

    /*
     * Import WC codes from CSV.
     * Supports memory storage (file.buffer) and disk storage (file.path).
     */
    public async importFromCSV(
        file: Express.Multer.File,
        userId: string,
        tenantId: string
    ): Promise<IImportWCCodesResponse> {
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

            // Pre-load all existing (codeNumber, description) hashes for this tenant — one DB call
            const existingCodes = await this.repository.collection
                .find({ tenantId, deletedAt: null })
                .project({ codeNumber: 1, description: 1 })
                .toArray() as { codeNumber: string; description: string }[];

            const existingHashes = new Set(
                existingCodes.map(c => this.buildDuplicateHash(c.codeNumber, c.description))
            );

            // ── PASS 1: validate every row, collect ALL errors ──────────────
            const validationErrors: Array<{ row: number; codeNumber: string; error: string }> = [];
            const withinFileHashes = new Set<string>();

            const parsedRows: Array<{ codeNumber: string; category: string; description: string }> = [];

            for (let i = 1; i < lines.length; i++) {
                const rowNumber = i + 1;
                const values = this.parseCSVLine(lines[i]);
                const codeNumber = values[codeNumberIndex]?.trim();
                const category = values[categoryIndex]?.trim();
                const description = values[descriptionIndex]?.trim();

                if (!codeNumber) {
                    validationErrors.push({ row: rowNumber, codeNumber: 'N/A', error: 'Missing code_number' });
                    continue;
                }
                if (!category) {
                    validationErrors.push({ row: rowNumber, codeNumber, error: 'Missing category' });
                    continue;
                }
                if (!description) {
                    validationErrors.push({ row: rowNumber, codeNumber, error: 'Missing description' });
                    continue;
                }

                const rowHash = this.buildDuplicateHash(codeNumber, description);

                if (existingHashes.has(rowHash)) {
                    validationErrors.push({ row: rowNumber, codeNumber, error: `Duplicate: code ${codeNumber} with this description already exists in the database` });
                    continue;
                }
                if (withinFileHashes.has(rowHash)) {
                    validationErrors.push({ row: rowNumber, codeNumber, error: `Duplicate: code ${codeNumber} with this description appears more than once in this file` });
                    continue;
                }

                withinFileHashes.add(rowHash);
                parsedRows.push({ codeNumber, category, description });
            }

            // ── Reject entire file if ANY validation error exists ───────────
            if (validationErrors.length > 0) {
                this.cleanupUploadedFile(file);
                throw new CustomError(
                    HttpStatusCode.UnprocessableEntity,
                    JSON.stringify({
                        message: `File rejected: ${validationErrors.length} error${validationErrors.length !== 1 ? 's' : ''} found. Fix all errors and re-upload.`,
                        errors: validationErrors
                    })
                );
            }

            // ── PASS 2: all rows valid — write everything ────────────────────
            const results: IImportWCCodesResponse = {
                success: 0,
                failed: 0,
                total: parsedRows.length,
                imported: [],
                errors: []
            };

            for (const row of parsedRows) {
                const newCode: Partial<IWCCode> = {
                    codeNumber: row.codeNumber,
                    category: row.category,
                    description: row.description,
                    duplicateHash: this.buildDuplicateHash(row.codeNumber, row.description),
                    type: WCCodeType.CUSTOM,
                    tenantId,
                    userId,
                    isActive: true,
                    createdAt: new Date(Utils.getCurrentDate()),
                    createdBy: userId,
                    updatedAt: null,
                    updatedBy: null,
                    deletedAt: null
                };

                const wcCodeModel = WCCodesModel.create(newCode);
                const createdCode = await this.repository.Add(wcCodeModel, optimizedWCCodeResponseFields) as IWCCode;
                await this.addCodeToKnowledgeBase(createdCode, userId, tenantId);
                results.success++;
                results.imported.push(createdCode);
            }

            // Clean up the uploaded file after processing
            this.cleanupUploadedFile(file);

            return results;

        } catch (error) {
            this.cleanupUploadedFile(file);
            // Re-throw CustomErrors as-is (preserves structured validation/rejection payloads)
            if (error instanceof CustomError) throw error;
            throw new CustomError(HttpStatusCode.InternalServerError, `CSV import failed: ${(error as any).message}`);
        }
    }

    /*
     * Generate CSV template for download
     */
    public async downloadTemplate(): Promise<Buffer> {
        const headers = 'code_number,category,description\n';
        const sampleRows = [
            '6421,Concrete,Carpentry - NOC',
            '5606,Painting,Painting - NOC',
            '5403,Carpentry,Carpentry Work'
        ].join('\n');

        return Buffer.from(headers + sampleRows, 'utf-8');
    }

    /*
     * ╔═══════════════════════════════════════╗
     * ║          HELPER METHODS               ║
     * ╚═══════════════════════════════════════╝
     */

    /*
     * Duplicate rule: (codeNumber + description) must be unique per tenant.
     * Same code number with a different description is a valid separate entry.
     */
    private async checkDuplicateCode(
        codeNumber: string,
        description: string,
        tenantId: string,
        excludeId?: string
    ): Promise<void> {
        const hash = this.buildDuplicateHash(codeNumber, description);
        const normalizedDesc = description.toLowerCase().replace(/\s+/g, ' ').trim();

        // Match by pre-computed hash (new records) OR raw fields (legacy records without hash)
        const existing = await this.repository.collection.findOne(
            {
                tenantId,
                deletedAt: null,
                $or: [
                    { duplicateHash: hash },
                    {
                        codeNumber: { $regex: `^${codeNumber.trim()}$`, $options: 'i' },
                        description: { $regex: `^${normalizedDesc}$`, $options: 'i' },
                    }
                ]
            },
            { projection: { _id: 1 } }
        );

        if (existing && (!excludeId || existing._id.toString() !== excludeId)) {
            throw new CustomError(
                HttpStatusCode.Conflict,
                `A WC code with code number "${codeNumber}" and the same description already exists`
            );
        }
    }

    /*
     * Hash (codeNumber + normalized description) for O(1) duplicate lookup.
     * Normalization: lowercase + collapse whitespace so "Roofing Work" == "roofing  work".
     */
    private buildDuplicateHash(codeNumber: string, description: string): string {
        const normalized = `${codeNumber.toLowerCase().trim()}::${description.toLowerCase().replace(/\s+/g, ' ').trim()}`;
        return createHash('sha256').update(normalized).digest('hex');
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

}

export default WCCodesService;
