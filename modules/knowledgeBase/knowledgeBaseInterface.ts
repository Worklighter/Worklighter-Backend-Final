import FillableField from "../../core/interfaces/fillableFields";
import { GeneralFillables } from "../../core/interfaces/generalInterface";
import KnowledgeBaseIngestionStatus from "../../core/enums/knowledgeBaseIngestionStatus";

export interface IKnowledgeBase {
    _id: string;
    title: string;
    content: IKnowledgeBaseContentChunk[];
    hash: string | null;

    fileName?: string | null;
    filePath?: string | null;
    fileType?: string | null;
    fileSize?: number | null;

    ingestionStatus: KnowledgeBaseIngestionStatus;
    ingestionStartedAt?: string | null;
    ingestionCompletedAt?: string | null;
    ingestionError?: string | null;
    ingestionRetryCount: number;

    chunkCreated: boolean;
    chunkIndex?: number | null;

    tokenCount: number;
    processingTime: number; // seconds
    vectorDocumentId?: string | null;

    userId: string;
    tenantId: string;

    createdAt: string;
    createdBy: string;
    updatedAt?: string | null;
    updatedBy?: string | null;
    deletedAt?: string | null;
}

export interface IKnowledgeBaseContentChunk {
    code: string;
    type: string;
    title: string;
    description: string;
}

export interface ICreateKnowledgeBaseDTO {
    title: string;
    content?: IKnowledgeBaseContentChunk[] | null;
}

export interface IGetKnowledgeBaseByIdDTO {
    id: string;
}

export interface IListKnowledgeBaseDTO {
    continuationToken?: number;
    pageSize?: number;
}

export interface ISearchKnowledgeBaseDTO {
    query: string;
    k?: number;
    filterQuery?: Record<string, string | number | boolean | Array<string | number | boolean>>;
}

export interface IAskKnowledgeBaseDTO {
    question: string;
    k?: number;
    filterQuery?: Record<string, string | number | boolean | Array<string | number | boolean>>;
}

export interface IKnowledgeBaseVectorChunk {
    chunkId: string;
    parentChunkId?: string | null;
    chunkOrder: number;
    documentId: string;
    documentName: string;
    filePath?: string | null;
    totalChunks: number;
    chunkSize: number;
    createdAt: string;
    userId: string;
    tenantId: string;
    code?: string | null;
    codeType?: string | null;
    codeDescription?: string | null;
    content: string;
    score?: number;
}

export interface IKnowledgeBaseSearchResult {
    matches: IKnowledgeBaseVectorChunk[];
}

export interface IKnowledgeBaseAskCitation {
    documentId: string;
    chunkId: string;
    chunkOrder: number;
    title: string;
    snippet: string;
    score?: number;
}

export interface IKnowledgeBaseAskResponse {
    finalAnswer: string;
    citations: IKnowledgeBaseAskCitation[];
    note?: string;
}

export const KnowledgeBaseFillableFields: FillableField[] = [
    { column: 'title', columnDataType: 'string' },
    { column: 'content', columnDataType: 'array' },
    { column: 'hash', columnDataType: 'string' },
    { column: 'fileName', columnDataType: 'string' },
    { column: 'filePath', columnDataType: 'string' },
    { column: 'fileType', columnDataType: 'string' },
    { column: 'fileSize', columnDataType: 'number' },
    { column: 'ingestionStatus', columnDataType: 'string' },
    { column: 'ingestionStartedAt', columnDataType: 'string' },
    { column: 'ingestionCompletedAt', columnDataType: 'string' },
    { column: 'ingestionError', columnDataType: 'string' },
    { column: 'ingestionRetryCount', columnDataType: 'number' },
    { column: 'chunkCreated', columnDataType: 'boolean' },
    { column: 'chunkIndex', columnDataType: 'number' },
    { column: 'tokenCount', columnDataType: 'number' },
    { column: 'processingTime', columnDataType: 'number' },
    { column: 'vectorDocumentId', columnDataType: 'string' },
    { column: 'userId', columnDataType: 'string' },
    { column: 'tenantId', columnDataType: 'string' },
    ...GeneralFillables,
];

export const optimizedKnowledgeBaseResponseFields = [
    '_id',
    'title',
    'hash',
    'fileName',
    'filePath',
    'fileType',
    'fileSize',
    'ingestionStatus',
    'ingestionStartedAt',
    'ingestionCompletedAt',
    'ingestionError',
    'ingestionRetryCount',
    'chunkCreated',
    'chunkIndex',
    'tokenCount',
    'processingTime',
    'vectorDocumentId',
    'userId',
    'tenantId',
    'createdAt',
    'createdBy',
    'updatedAt',
    'updatedBy',
];
