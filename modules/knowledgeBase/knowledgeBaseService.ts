import { HttpStatusCode } from "axios";
import { ObjectId } from "mongodb";
import { Readable } from "stream";
import { CustomError } from "../../core/errors/custom";
import IJWTPayload from "../../core/interfaces/jwt";
import AzureBlobStorage from "../../integration/azure/azureBlobStorage";
import { AzureDocumentIntelligenceService } from "../../integration/azure/docIntelligence";
import AttachmentAnalyzer, { ProcessingMethod } from "../../utils/helpers/attachmentAnalyzer";
import { Utils } from "../../utils/utils";
import KnowledgeBaseIngestionStatus from "../../core/enums/knowledgeBaseIngestionStatus";
import KnowledgeBaseRepository from "./knowledgeBaseRepository";
import KnowledgeBaseModel from "./knowledgeBaseModel";
import { KnowledgeBaseUtils } from "./knowledgeBaseUtils";
import {
    IAskKnowledgeBaseDTO,
    ICreateKnowledgeBaseDTO,
    IKnowledgeBaseContentChunk,
    IGetKnowledgeBaseByIdDTO,
    IKnowledgeBase,
    IListKnowledgeBaseDTO,
    ISearchKnowledgeBaseDTO,
    optimizedKnowledgeBaseResponseFields
} from "./knowledgeBaseInterface";
import KnowledgeBaseJobProcessor from "../../core/jobs/knowledgeBaseJobProcessor";
import AzureAISearch from "../../integration/azure/aiSearch";

interface ICreateCodeKnowledgeBaseEntryParams {
    codeNumber: string;
    category: string;
    description: string;
    codeType: 'cost_code' | 'wc_code' | 'com_code' | 'cost' | 'com' | 'costcode' | 'comcode' | 'wccode';
    userId: string;
    tenantId: string;
    sourceId?: string;
}

interface IDeleteCodeKnowledgeBaseEntryParams {
    codeType: 'cost_code' | 'wc_code' | 'com_code' | 'cost' | 'com' | 'costcode' | 'comcode' | 'wccode';
    sourceId: string;
    userId: string;
    tenantId: string;
}

interface IUpdateCodeKnowledgeBaseEntryParams extends ICreateCodeKnowledgeBaseEntryParams {
    sourceId: string;
}


class KnowledgeBaseService {
    private static instance: KnowledgeBaseService;
    private repository: KnowledgeBaseRepository;

    private constructor() {
        this.repository = KnowledgeBaseRepository.getInstance();
    }

    public static getInstance(): KnowledgeBaseService {
        if (!KnowledgeBaseService.instance) {
            KnowledgeBaseService.instance = new KnowledgeBaseService();
        }
        return KnowledgeBaseService.instance;
    }

    private resolveScope(user: IJWTPayload): { userId: string; tenantId: string } {
        const userId = user?.id;
        const tenantId = user?.tenantId || user?.id;
        if (!userId) throw new CustomError(HttpStatusCode.Unauthorized, 'Unauthorized');
        if (!tenantId) throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
        return { userId, tenantId };
    }

    private async uploadFileIfPresent(file?: Express.Multer.File, tenantId?: string): Promise<{ filePath?: string | null; fileName?: string | null; fileType?: string | null; fileSize?: number | null; }> {
        if (!file) return { filePath: null, fileName: null, fileType: null, fileSize: null };
        const stream = Readable.from(file.buffer);
        const filePath = await AzureBlobStorage.getInstance().uploadDocument(stream, file.originalname, undefined, tenantId);
        return {
            filePath,
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
        };
    }

    private async extractTextFromFile(file: Express.Multer.File): Promise<string> {
        const analyzer = AttachmentAnalyzer.getInstance();
        const analysis = await analyzer.analyzeAttachment(file);

        if (analysis.method === ProcessingMethod.DIRECT_TEXT_EXTRACTION) {
            return analysis.extractedText || '';
        }

        const di = AzureDocumentIntelligenceService.getInstance();
        const diResult = await di.analyzeDocument(file.buffer);

        // Prefer DI markdown content; fall back to direct extraction if DI yields nothing.
        return diResult.content || analysis.extractedText || '';
    }

    private normalizeIncomingChunks(chunks: any[]): IKnowledgeBaseContentChunk[] {
        return (chunks || [])
            .map(chunk => KnowledgeBaseUtils.normalizeChunk(chunk || {}))
            .filter(chunk => KnowledgeBaseUtils.chunkToText(chunk).length > 0);
    }

    private normalizeCodeType(codeType: string): 'cost_code' | 'wc_code' {
        const normalizedCodeType = (codeType || '').toLowerCase().replace(/[\s_-]/g, '');
        return normalizedCodeType === 'cost' || normalizedCodeType === 'costcode' || normalizedCodeType === 'costcodes'
            ? 'cost_code'
            : 'wc_code';
    }

    public async createKBEntry(dto: ICreateKnowledgeBaseDTO, file: Express.Multer.File | undefined, loggedInUser: IJWTPayload): Promise<IKnowledgeBase> {
        const { userId, tenantId } = this.resolveScope(loggedInUser);

        const title = (dto?.title || '').trim();
        if (!title) throw new CustomError(HttpStatusCode.BadRequest, 'Title is required');

        const contentFromBody = Array.isArray(dto?.content) ? dto.content : [];
        const normalizedBodyChunks = this.normalizeIncomingChunks(contentFromBody as any[]);
        let finalChunks: IKnowledgeBaseContentChunk[] = [...normalizedBodyChunks];

        const uploadedFileMeta = await this.uploadFileIfPresent(file, tenantId);
        if (file) {
            const extracted = KnowledgeBaseUtils.normalizeText(await this.extractTextFromFile(file));
            if (extracted) {
                finalChunks.push({
                    code: '',
                    type: 'file',
                    title: file.originalname || title,
                    description: extracted,
                });
            }
        }

        if (!finalChunks.length) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Either content or file upload is required');
        }

        const now = Utils.getCurrentDate();
        const record: Partial<IKnowledgeBase> = {
            title,
            content: finalChunks,
            hash: null,
            ...uploadedFileMeta,
            ingestionStatus: KnowledgeBaseIngestionStatus.PENDING,
            ingestionStartedAt: now,
            ingestionCompletedAt: null,
            ingestionError: null,
            ingestionRetryCount: 0,
            chunkCreated: false,
            chunkIndex: null,
            tokenCount: KnowledgeBaseUtils.calculateTokenCountForChunks(finalChunks),
            processingTime: 0,
            vectorDocumentId: null,
            userId,
            tenantId,
            createdAt: now,
            createdBy: userId,
            updatedAt: null,
            updatedBy: null,
            deletedAt: null,
        };

        const model = KnowledgeBaseModel.create(record);
        const created = await this.repository.Add<IKnowledgeBase>(model, optimizedKnowledgeBaseResponseFields);

        KnowledgeBaseJobProcessor.getInstance().enqueueKnowledgeBaseProcessingJob({ id: String((created as any)?._id) });

        return created;
    }

    public async createCodeKBEntry(params: ICreateCodeKnowledgeBaseEntryParams): Promise<IKnowledgeBase | null> {
        const codeNumber = (params?.codeNumber || '').trim();
        const category = (params?.category || '').trim();
        const description = (params?.description || '').trim();
        const userId = params?.userId;
        const tenantId = params?.tenantId;

        if (!codeNumber || !category || !description || !userId || !tenantId) {
            return null;
        }

        const codeType = this.normalizeCodeType(params.codeType);
        const label = codeType === 'wc_code' ? 'WC Code' : 'Cost Code';
        const sourceId = params.sourceId || codeNumber;
        const hash = `code:${codeType}:${tenantId}:${sourceId}`;

        const existing = await this.repository.GetOneByParams<IKnowledgeBase>([
            { param: 'hash', value: hash, operator: 'AND' },
            { param: 'tenantId', value: tenantId, operator: 'AND' },
            { param: 'deletedAt', value: null, operator: 'AND' },
        ], ['_id']);

        if (existing) {
            return existing;
        }

        const content: IKnowledgeBaseContentChunk[] = [{
            code: codeNumber,
            type: codeType,
            title: category,
            description,
        }];

        const now = Utils.getCurrentDate();
        const record: Partial<IKnowledgeBase> = {
            title: `${label}: ${codeNumber} - ${category}`,
            content,
            hash,
            fileName: null,
            filePath: null,
            fileType: null,
            fileSize: null,
            ingestionStatus: KnowledgeBaseIngestionStatus.PENDING,
            ingestionStartedAt: now,
            ingestionCompletedAt: null,
            ingestionError: null,
            ingestionRetryCount: 0,
            chunkCreated: false,
            chunkIndex: null,
            tokenCount: KnowledgeBaseUtils.calculateTokenCountForChunks(content),
            processingTime: 0,
            vectorDocumentId: null,
            userId,
            tenantId,
            createdAt: now,
            createdBy: userId,
            updatedAt: null,
            updatedBy: null,
            deletedAt: null,
        };

        const model = KnowledgeBaseModel.create(record);
        const created = await this.repository.Add<IKnowledgeBase>(model, optimizedKnowledgeBaseResponseFields);
        KnowledgeBaseJobProcessor.getInstance().enqueueKnowledgeBaseProcessingJob({ id: String((created as any)?._id) });

        return created;
    }

    public async deleteCodeKBEntry(params: IDeleteCodeKnowledgeBaseEntryParams): Promise<{ deleted: boolean; vectorChunksDeleted: number }> {
        const sourceId = (params?.sourceId || '').trim();
        const userId = params?.userId;
        const tenantId = params?.tenantId;

        if (!sourceId || !userId || !tenantId) {
            return { deleted: false, vectorChunksDeleted: 0 };
        }

        const codeType = this.normalizeCodeType(params.codeType);
        const hash = `code:${codeType}:${tenantId}:${sourceId}`;
        const kb = await this.repository.GetOneByParams<IKnowledgeBase>([
            { param: 'hash', value: hash, operator: 'AND' },
            { param: 'userId', value: userId, operator: 'AND' },
            { param: 'tenantId', value: tenantId, operator: 'AND' },
            { param: 'deletedAt', value: null, operator: 'AND' },
        ], optimizedKnowledgeBaseResponseFields);

        if (!kb) {
            return { deleted: false, vectorChunksDeleted: 0 };
        }

        const vectorDocumentId = kb.vectorDocumentId || String((kb as any)._id);
        const vectorDeleteResult = vectorDocumentId
            ? await AzureAISearch.getInstance().deleteDocumentsByDocumentId(vectorDocumentId, userId, tenantId)
            : { deleted: 0 };

        await this.repository.HardDelete(String((kb as any)._id));

        return { deleted: true, vectorChunksDeleted: vectorDeleteResult.deleted };
    }

    public async updateCodeKBEntry(params: IUpdateCodeKnowledgeBaseEntryParams): Promise<IKnowledgeBase | null> {
        const codeNumber = (params?.codeNumber || '').trim();
        const category = (params?.category || '').trim();
        const description = (params?.description || '').trim();
        const sourceId = (params?.sourceId || '').trim();
        const userId = params?.userId;
        const tenantId = params?.tenantId;

        if (!codeNumber || !category || !description || !sourceId || !userId || !tenantId) {
            return null;
        }

        const codeType = this.normalizeCodeType(params.codeType);
        const label = codeType === 'wc_code' ? 'WC Code' : 'Cost Code';
        const hash = `code:${codeType}:${tenantId}:${sourceId}`;
        const kb = await this.repository.GetOneByParams<IKnowledgeBase>([
            { param: 'hash', value: hash, operator: 'AND' },
            { param: 'userId', value: userId, operator: 'AND' },
            { param: 'tenantId', value: tenantId, operator: 'AND' },
            { param: 'deletedAt', value: null, operator: 'AND' },
        ], optimizedKnowledgeBaseResponseFields);

        if (!kb) {
            return this.createCodeKBEntry(params);
        }

        const vectorDocumentId = kb.vectorDocumentId || String((kb as any)._id);
        if (vectorDocumentId) {
            await AzureAISearch.getInstance().deleteDocumentsByDocumentId(vectorDocumentId, userId, tenantId);
        }

        const content: IKnowledgeBaseContentChunk[] = [{
            code: codeNumber,
            type: codeType,
            title: category,
            description,
        }];

        const updated = await this.repository.Update<IKnowledgeBase>(new ObjectId(String((kb as any)._id)), {
            title: `${label}: ${codeNumber} - ${category}`,
            content,
            ingestionStatus: KnowledgeBaseIngestionStatus.PENDING,
            ingestionStartedAt: Utils.getCurrentDate(),
            ingestionCompletedAt: null,
            ingestionError: null,
            chunkCreated: false,
            chunkIndex: null,
            tokenCount: KnowledgeBaseUtils.calculateTokenCountForChunks(content),
            processingTime: 0,
            vectorDocumentId: null,
            updatedAt: Utils.getCurrentDate(),
            updatedBy: userId,
        }, optimizedKnowledgeBaseResponseFields);

        KnowledgeBaseJobProcessor.getInstance().enqueueKnowledgeBaseProcessingJob({ id: String((kb as any)._id) });

        return updated;
    }

    public async getKBEntries(dto: IListKnowledgeBaseDTO, loggedInUser: IJWTPayload): Promise<{ data: IKnowledgeBase[]; continuationToken: string | null; total: number; page: number; pageSize: number; }> {
        const { userId, tenantId } = this.resolveScope(loggedInUser);
        const { continuationToken = 0, pageSize = 15 } = dto || {};

        const parameters: any[] = [
            { param: 'userId', value: userId, operator: 'AND' },
            { param: 'tenantId', value: tenantId, operator: 'AND' },
        ];

        const result = await this.repository.GetAll<{ data: IKnowledgeBase[]; continuationToken: string | null }>(
            parameters,
            true,
            continuationToken,
            pageSize,
            { createdAt: -1 },
            optimizedKnowledgeBaseResponseFields,
        ) as any;

        const total = await this.repository.Count(parameters);

        return {
            data: result.data || [],
            continuationToken: result.continuationToken || null,
            total,
            page: Math.floor((continuationToken || 0) / pageSize) + 1,
            pageSize,
        };
    }

    public async getKBEntry(dto: IGetKnowledgeBaseByIdDTO, loggedInUser: IJWTPayload): Promise<any> {
        const { userId, tenantId } = this.resolveScope(loggedInUser);
        const { id } = dto;
        if (!ObjectId.isValid(id)) throw new CustomError(HttpStatusCode.BadRequest, 'Invalid knowledge base ID');

        const kb = await this.repository.GetOneByParams<IKnowledgeBase>([
            { param: '_id', value: new ObjectId(id), operator: 'AND' },
            { param: 'userId', value: userId, operator: 'AND' },
            { param: 'tenantId', value: tenantId, operator: 'AND' },
        ], [...optimizedKnowledgeBaseResponseFields, 'content']);

        if (!kb) throw new CustomError(HttpStatusCode.NotFound, 'Knowledge base entry not found');

        if (kb.ingestionStatus === KnowledgeBaseIngestionStatus.COMPLETED && kb.vectorDocumentId) {
            const chunks = await AzureAISearch.getInstance().getChunksByDocumentId(
                kb.vectorDocumentId,
                userId,
                tenantId,
            );
            return { ...kb, vectorChunks: chunks };
        }

        return kb;
    }

    public async searchKBEntries(dto: ISearchKnowledgeBaseDTO, loggedInUser: IJWTPayload) {
        const { userId, tenantId } = this.resolveScope(loggedInUser);
        const { query, k = 8, filterQuery } = dto;
        return AzureAISearch.getInstance().retrieveDocuments(query, userId, tenantId, k, filterQuery);
    }

    public async askKnowledgeBase(dto: IAskKnowledgeBaseDTO, loggedInUser: IJWTPayload) {
        const { userId, tenantId } = this.resolveScope(loggedInUser);
        const { question, k = 8, filterQuery } = dto;
        return AzureAISearch.getInstance().ask(question, userId, tenantId, k, filterQuery);
    }

    public async deleteKBEntry(id: string, loggedInUser: IJWTPayload): Promise<{ message: string }> {
        const { userId, tenantId } = this.resolveScope(loggedInUser);
        if (!ObjectId.isValid(id)) throw new CustomError(HttpStatusCode.BadRequest, 'Invalid knowledge base ID');

        const kb = await this.repository.GetOneByParams<IKnowledgeBase>([
            { param: '_id', value: new ObjectId(id), operator: 'AND' },
            { param: 'userId', value: userId, operator: 'AND' },
            { param: 'tenantId', value: tenantId, operator: 'AND' },
        ], optimizedKnowledgeBaseResponseFields);

        if (!kb) throw new CustomError(HttpStatusCode.NotFound, 'Knowledge base entry not found');

        if (kb.filePath) {
            try {
                const url = new URL(kb.filePath);
                const segments = url.pathname.split('/').filter(Boolean);
                // pathname: /{container}/{blobName...}
                const blobName = segments.slice(1).join('/');
                if (blobName) {
                    await AzureBlobStorage.getInstance().deleteFile(blobName);
                }
            } catch (e) {
                // Best-effort cleanup; do not block deletion on blob errors.
            }
        }

        const vectorDocumentId = kb.vectorDocumentId || String((kb as any)._id);
        if (vectorDocumentId) {
            await AzureAISearch.getInstance().deleteDocumentsByDocumentId(vectorDocumentId, userId, tenantId);
        }

        await this.repository.HardDelete(String((kb as any)._id));

        return { message: 'Knowledge base entry deleted successfully' };
    }
}

export default KnowledgeBaseService;
