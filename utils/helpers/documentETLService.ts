import * as fs from 'fs';
import * as path from 'path';
import { Utils } from '../../utils/utils';
import OnboardingRepository from '../../modules/company/companyRepository';
import CostCodesRepository from '../../modules/costCodes/costCodesRepository';
import WCCodesRepository from '../../modules/wcCodes/wcCodesRepository';
import { IDocumentData, IExtractedData, DocumentType, ICompany } from '../../modules/company/companyInterface';
import { Logger } from '../../utils/helpers/logger';
import { ObjectId } from 'mongodb';

/**c
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                    DOCUMENT ETL PIPELINE                       ║
 * ║    Extract, Transform, Load pipeline for document processing   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

class DocumentETLService {
    private static instance: DocumentETLService;
    private readonly uploadsPath: string;

    private constructor() {
        this.uploadsPath = path.join(process.cwd(), 'uploads');
    }

    public static getInstance(): DocumentETLService {
        if (!DocumentETLService.instance) {
            DocumentETLService.instance = new DocumentETLService();
        }
        return DocumentETLService.instance;
    }

    /**
     * ╔═══════════════════════════════════════╗
     * ║           MAIN ETL PROCESS            ║
     * ╚═══════════════════════════════════════╝
     */

    /**
     * Process all uploaded files through the ETL pipeline
     * @param files - Uploaded files object from multer
     * @param userId - User ID who uploaded the files
     * @param tenantId - Tenant ID for multi-tenancy
     */
    public async processFiles(files: any, userId: string, tenantId: string): Promise<IDocumentData[]> {
        const processedDocuments: IDocumentData[] = [];

        const getFileGroup = (keys: string[]): Express.Multer.File[] | undefined => {
            if (!files) return undefined;
            for (const key of keys) {
                if (files[key]?.length) return files[key];
            }
            return undefined;
        };

        try {
            // Process cost codes files
            const costCodesFiles = getFileGroup(['costCodesFiles', 'costCodesFiles[]', 'costCodesFile']);
            if (costCodesFiles) {
                const results = await this.processFileGroup(
                    costCodesFiles,
                    userId,
                    tenantId,
                    'cost_codes'
                );
                processedDocuments.push(...results);
            }

            // Process workers comp files
            const workersCompFiles = getFileGroup(['workersCompFiles', 'workersCompFiles[]', 'workersCompFile']);
            if (workersCompFiles) {
                const results = await this.processFileGroup(
                    workersCompFiles,
                    userId,
                    tenantId,
                    'workers_comp'
                );
                processedDocuments.push(...results);
            }

            // Compliance documents are accepted in onboarding but not ETL-processed/saved

            Logger.Log(`ETL: Processed ${processedDocuments.length} documents for tenantId ${tenantId}`, 'info');

            return processedDocuments;
        } catch (error) {
            Logger.Log(`ETL Pipeline Error: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Process a group of files of the same category
     */
    private async processFileGroup(
        fileGroup: Express.Multer.File[],
        userId: string,
        tenantId: string,
        category: 'cost_codes' | 'workers_comp' | 'compliance'
    ): Promise<IDocumentData[]> {
        const results: IDocumentData[] = [];

        for (const file of fileGroup) {
            try {
                // EXTRACT
                const extractedData = await this.extract(file);

                // TRANSFORM
                const transformedData = this.transform(extractedData, file, userId, tenantId, category);

                // LOAD: Store in the appropriate repository based on category
                const savedDocument = await this.loadToRepository(transformedData, category);
                results.push(savedDocument);

                const fileName = file.filename || file.originalname || 'file';
                Logger.Log(`ETL: Successfully processed ${fileName}`, 'info');
            } catch (error) {
                const fileName = file.filename || file.originalname || 'file';
                Logger.Log(`ETL: Failed to process ${fileName}: ${error.message}`, 'error');
                // Continue processing other files
            }
        }

        return results;
    }

    /**
     * ╔═══════════════════════════════════════╗
     * ║           EXTRACT PHASE               ║
     * ╚═══════════════════════════════════════╝
     */

    /**
     * Extract data from file based on file type
     */
    private async extract(file: Express.Multer.File): Promise<IExtractedData> {
        const filePath = file.filename ? path.join(this.uploadsPath, file.filename) : undefined;
        const extension = path.extname(file.originalname).toLowerCase();

        switch (extension) {
            case '.csv':
                return await this.extractCSV(filePath, file);
            case '.pdf':
                return await this.extractPDF(filePath, file);
            case '.xlsx':
            case '.xls':
                return await this.extractExcel(filePath, file);
            case '.doc':
            case '.docx':
                return await this.extractWord(filePath, file);
            default:
                return this.extractGeneric(file);
        }
    }

    /**
     * Extract data from CSV file
     */
    private async extractCSV(filePath: string | undefined, file: Express.Multer.File): Promise<IExtractedData> {
        const content = file.buffer
            ? file.buffer.toString('utf-8')
            : fs.readFileSync(filePath as string, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            return {
                documentType: 'csv',
                rawContent: content,
                headers: [],
                rows: [],
                metadata: this.getFileMetadata(file),
                recordCount: 0
            };
        }

        // Parse headers (first row)
        const headers = this.parseCSVLine(lines[0]);
        
        // Parse data rows
        const rows: Record<string, any>[] = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length > 0) {
                const row: Record<string, any> = {};
                headers.forEach((header, index) => {
                    row[this.sanitizeHeader(header)] = values[index] || null;
                });
                rows.push(row);
            }
        }

        return {
            documentType: 'csv',
            rawContent: content,
            headers,
            rows,
            metadata: this.getFileMetadata(file),
            recordCount: rows.length
        };
    }

    /**
     * Parse a single CSV line handling quoted values
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

    /**
     * Extract data from PDF file
     */
    private async extractPDF(filePath: string | undefined, file: Express.Multer.File): Promise<IExtractedData> {
        try {
            // Dynamic import for pdf-parse
            const pdfParse = require('pdf-parse');
            const dataBuffer = file.buffer || fs.readFileSync(filePath as string);
            const pdfData = await pdfParse(dataBuffer);

            const textContent = pdfData.text || '';
            const lines = textContent.split('\n').filter((line: string) => line.trim());

            // Try to detect table structure in PDF
            const tableData = this.detectTableInText(lines);

            return {
                documentType: 'pdf',
                rawContent: textContent,
                headers: tableData.headers,
                rows: tableData.rows,
                metadata: {
                    ...this.getFileMetadata(file),
                    pageCount: pdfData.numpages,
                    pdfInfo: pdfData.info
                },
                recordCount: tableData.rows.length
            };
        } catch (error) {
            // If pdf-parse is not installed, return basic metadata
            Logger.Log(`PDF parsing not available: ${error.message}`, 'warning');
            return {
                documentType: 'pdf',
                rawContent: '',
                headers: [],
                rows: [],
                metadata: {
                    ...this.getFileMetadata(file),
                    parseError: 'PDF parsing library not available. Install pdf-parse for full extraction.'
                },
                recordCount: 0
            };
        }
    }

    /**
     * Extract data from Excel file
     */
    private async extractExcel(filePath: string | undefined, file: Express.Multer.File): Promise<IExtractedData> {
        try {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            if (file.buffer) {
                await workbook.xlsx.load(file.buffer);
            } else {
                await workbook.xlsx.readFile(filePath as string);
            }

            const worksheet = workbook.worksheets[0];
            if (!worksheet) {
                return {
                    documentType: 'excel',
                    rawContent: '',
                    headers: [],
                    rows: [],
                    metadata: this.getFileMetadata(file),
                    recordCount: 0
                };
            }

            const sheetNames: string[] = workbook.worksheets.map((ws: any) => ws.name);
            const jsonData: any[][] = [];
            worksheet.eachRow((row: any) => {
                jsonData.push(row.values.slice(1).map((v: any) => v ?? null));
            });

            if (jsonData.length === 0) {
                return {
                    documentType: 'excel',
                    rawContent: '',
                    headers: [],
                    rows: [],
                    metadata: this.getFileMetadata(file),
                    recordCount: 0
                };
            }

            const headers = (jsonData[0] as string[]).map(h => String(h || ''));
            const rows: Record<string, any>[] = [];

            for (let i = 1; i < jsonData.length; i++) {
                const rowData = jsonData[i] as any[];
                if (rowData && rowData.some(cell => cell !== null && cell !== undefined && cell !== '')) {
                    const row: Record<string, any> = {};
                    headers.forEach((header, index) => {
                        row[this.sanitizeHeader(header)] = rowData[index] ?? null;
                    });
                    rows.push(row);
                }
            }

            return {
                documentType: 'excel',
                rawContent: JSON.stringify(jsonData),
                headers,
                rows,
                metadata: {
                    ...this.getFileMetadata(file),
                    sheetNames
                },
                recordCount: rows.length
            };
        } catch (error) {
            Logger.Log(`Excel parsing not available: ${error.message}`, 'warning');
            return {
                documentType: 'excel',
                rawContent: '',
                headers: [],
                rows: [],
                metadata: {
                    ...this.getFileMetadata(file),
                    parseError: 'Excel parsing library not available. Install exceljs for full extraction.'
                },
                recordCount: 0
            };
        }
    }

    /**
     * Extract data from Word document
     */
    private async extractWord(filePath: string | undefined, file: Express.Multer.File): Promise<IExtractedData> {
        try {
            // Dynamic import for mammoth
            const mammoth = require('mammoth');
            const result = file.buffer
                ? await mammoth.extractRawText({ buffer: file.buffer })
                : await mammoth.extractRawText({ path: filePath as string });
            const textContent = result.value || '';
            
            // Try to detect table structure in text
            const lines = textContent.split('\n').filter((line: string) => line.trim());
            const tableData = this.detectTableInText(lines);

            return {
                documentType: 'word',
                rawContent: textContent,
                headers: tableData.headers,
                rows: tableData.rows,
                metadata: {
                    ...this.getFileMetadata(file),
                    messages: result.messages
                },
                recordCount: tableData.rows.length
            };
        } catch (error) {
            Logger.Log(`Word parsing not available: ${error.message}`, 'warning');
            return {
                documentType: 'word',
                rawContent: '',
                headers: [],
                rows: [],
                metadata: {
                    ...this.getFileMetadata(file),
                    parseError: 'Word parsing library not available. Install mammoth for full extraction.'
                },
                recordCount: 0
            };
        }
    }

    /**
     * Generic extraction for unsupported file types
     */
    private extractGeneric(file: Express.Multer.File): IExtractedData {
        return {
            documentType: 'other',
            rawContent: '',
            headers: [],
            rows: [],
            metadata: this.getFileMetadata(file),
            recordCount: 0
        };
    }

    /**
     * ╔═══════════════════════════════════════╗
     * ║          TRANSFORM PHASE              ║
     * ╚═══════════════════════════════════════╝
     */

    /**
     * Transform extracted data into document data format
     */
    private transform(
        extractedData: IExtractedData,
        file: Express.Multer.File,
        userId: string,
        tenantId: string,
        category: 'cost_codes' | 'workers_comp' | 'compliance'
    ): IDocumentData {
        // Normalize and clean data
        const normalizedRows = extractedData.rows.map(row => this.normalizeRow(row));

        // Detect and standardize column types
        const columnTypes = this.detectColumnTypes(extractedData.headers, normalizedRows);

        // Generate summary statistics
        const summary = this.generateSummary(normalizedRows, extractedData.headers);

        return {
            userId,
            tenantId,
            onboardingId: tenantId,
            category,
            fileName: file.filename || file.originalname,
            originalFileName: file.originalname,
            documentType: extractedData.documentType as DocumentType,
            mimeType: file.mimetype,
            fileSize: file.size,
            headers: extractedData.headers,
            columnTypes,
            data: normalizedRows,
            recordCount: normalizedRows.length,
            summary,
            rawContent: extractedData.rawContent,
            metadata: extractedData.metadata,
            status: 'processed',
            createdAt: Utils.getCurrentDate(),
            updatedAt: Utils.getCurrentDate()
        };
    }

    /**
     * Load document data to the appropriate repository based on category
     */
    private async loadToRepository(
        documentData: IDocumentData,
        category: 'cost_codes' | 'workers_comp' | 'compliance'
    ): Promise<IDocumentData> {
        let savedDocument: IDocumentData;

        switch (category) {
            case 'cost_codes':
                savedDocument = await CostCodesRepository.getInstance().Add(documentData) as IDocumentData;
                Logger.Log(`ETL: Saved cost codes document for tenantId ${documentData.tenantId}`, 'info');
                break;
            case 'workers_comp':
                savedDocument = await WCCodesRepository.getInstance().Add(documentData) as IDocumentData;
                Logger.Log(`ETL: Saved workers comp document for tenantId ${documentData.tenantId}`, 'info');
                break;
            case 'compliance':
                savedDocument = documentData;
                Logger.Log('ETL: Compliance documents are not persisted by design', 'info');
                break;
            default:
                throw new Error(`Unknown document category: ${category}`);
        }

        return savedDocument;
    }

    /**
     * Normalize a single data row
     */
    private normalizeRow(row: Record<string, any>): Record<string, any> {
        const normalized: Record<string, any> = {};

        for (const [key, value] of Object.entries(row)) {
            if (value === null || value === undefined || value === '') {
                normalized[key] = null;
            } else if (typeof value === 'string') {
                // Trim whitespace
                let cleanValue = value.trim();
                
                // Try to parse numbers
                if (/^-?\d+\.?\d*$/.test(cleanValue)) {
                    normalized[key] = parseFloat(cleanValue);
                }
                // Try to parse dates
                else if (this.isDateString(cleanValue)) {
                    normalized[key] = cleanValue; // Keep as string but validated
                }
                // Try to parse booleans
                else if (['true', 'false', 'yes', 'no'].includes(cleanValue.toLowerCase())) {
                    normalized[key] = ['true', 'yes'].includes(cleanValue.toLowerCase());
                }
                else {
                    normalized[key] = cleanValue;
                }
            } else {
                normalized[key] = value;
            }
        }

        return normalized;
    }

    /**
     * Detect column types based on data
     */
    private detectColumnTypes(headers: string[], rows: Record<string, any>[]): Record<string, string> {
        const columnTypes: Record<string, string> = {};

        for (const header of headers) {
            const sanitizedHeader = this.sanitizeHeader(header);
            const values = rows.map(row => row[sanitizedHeader]).filter(v => v !== null);

            if (values.length === 0) {
                columnTypes[sanitizedHeader] = 'unknown';
            } else if (values.every(v => typeof v === 'number')) {
                columnTypes[sanitizedHeader] = 'number';
            } else if (values.every(v => typeof v === 'boolean')) {
                columnTypes[sanitizedHeader] = 'boolean';
            } else if (values.every(v => this.isDateString(String(v)))) {
                columnTypes[sanitizedHeader] = 'date';
            } else {
                columnTypes[sanitizedHeader] = 'string';
            }
        }

        return columnTypes;
    }

    /**
     * Generate summary statistics for the data
     */
    private generateSummary(rows: Record<string, any>[], headers: string[]): Record<string, any> {
        const summary: Record<string, any> = {
            totalRecords: rows.length,
            columns: headers.length,
            columnStats: {}
        };

        for (const header of headers) {
            const sanitizedHeader = this.sanitizeHeader(header);
            const values = rows.map(row => row[sanitizedHeader]).filter(v => v !== null);
            
            summary.columnStats[sanitizedHeader] = {
                nonNullCount: values.length,
                nullCount: rows.length - values.length,
                uniqueCount: new Set(values.map(v => JSON.stringify(v))).size
            };

            // Add numeric stats if applicable
            const numericValues = values.filter(v => typeof v === 'number') as number[];
            if (numericValues.length > 0) {
                summary.columnStats[sanitizedHeader].min = Math.min(...numericValues);
                summary.columnStats[sanitizedHeader].max = Math.max(...numericValues);
                summary.columnStats[sanitizedHeader].avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
            }
        }

        return summary;
    }

    /**
     * ╔═══════════════════════════════════════╗
     * ║            LOAD PHASE                 ║
     * ╚═══════════════════════════════════════╝
     */

    /**
     * Load is now handled in processFiles by updating the onboarding record
     * This method is kept for potential future use
     */
    private async load(documentData: IDocumentData): Promise<IDocumentData> {
        // Data is now stored directly in onboarding record
        return documentData;
    }

    /**
     * ╔═══════════════════════════════════════╗
     * ║          HELPER METHODS               ║
     * ╚═══════════════════════════════════════╝
     */

    /**
     * Get file metadata
     */
    private getFileMetadata(file: Express.Multer.File): Record<string, any> {
        return {
            originalName: file.originalname,
            encoding: file.encoding,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: Utils.getCurrentDate()
        };
    }

    /**
     * Sanitize header names for database storage
     */
    private sanitizeHeader(header: string): string {
        return header
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    /**
     * Check if a string is a valid date
     */
    private isDateString(value: string): boolean {
        const datePatterns = [
            /^\d{4}-\d{2}-\d{2}$/,                    // YYYY-MM-DD
            /^\d{2}\/\d{2}\/\d{4}$/,                  // MM/DD/YYYY
            /^\d{2}-\d{2}-\d{4}$/,                    // MM-DD-YYYY
            /^\d{4}\/\d{2}\/\d{2}$/,                  // YYYY/MM/DD
        ];
        return datePatterns.some(pattern => pattern.test(value));
    }

    /**
     * Detect table structure in text content (for PDFs)
     */
    private detectTableInText(lines: string[]): { headers: string[], rows: Record<string, any>[] } {
        // Simple heuristic: look for consistent delimiter patterns
        const delimiters = ['\t', '|', '  '];
        
        for (const delimiter of delimiters) {
            const firstLine = lines[0];
            if (firstLine && firstLine.includes(delimiter)) {
                const headers = firstLine.split(delimiter).map(h => h.trim()).filter(h => h);
                
                if (headers.length > 1) {
                    const rows: Record<string, any>[] = [];
                    
                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].split(delimiter).map(v => v.trim());
                        if (values.length === headers.length) {
                            const row: Record<string, any> = {};
                            headers.forEach((header, index) => {
                                row[this.sanitizeHeader(header)] = values[index] || null;
                            });
                            rows.push(row);
                        }
                    }
                    
                    if (rows.length > 0) {
                        return { headers, rows };
                    }
                }
            }
        }

        return { headers: [], rows: [] };
    }

    /**
     * Get documents by onboarding ID
     */
    public async getDocumentsByOnboardingId(onboardingId: string): Promise<IDocumentData[]> {
        const onboarding = await OnboardingRepository.getInstance().GetById(onboardingId, []) as ICompany;
        return onboarding?.extractedDocumentData || [];
    }

    /**
     * Get documents by user ID
     */
    public async getDocumentsByUserId(userId: string): Promise<IDocumentData[]> {
        const onboardings = await OnboardingRepository.getInstance().collection.find({ userId }).toArray() as unknown as ICompany[];
        const allDocuments: IDocumentData[] = [];
        for (const onboarding of onboardings) {
            if (onboarding.extractedDocumentData) {
                allDocuments.push(...onboarding.extractedDocumentData);
            }
        }
        return allDocuments;
    }
}

export default DocumentETLService.getInstance();
