import { ObjectId } from 'mongodb';
import FillableField from "../../core/interfaces/fillableFields";
import { GeneralFillables } from "../../core/interfaces/generalInterface";
import KnowledgeBaseIngestionStatus from "../../core/enums/knowledgeBaseIngestionStatus";

/**
 * ╔═══════════════════════════════════════╗
 * ║     WC CODES INTERFACES               ║
 * ╚═══════════════════════════════════════╝
 */

/**
 * WC Code Type Enum
 */
export enum WCCodeType {
    STANDARD = 'standard', 
    CUSTOM = 'custom'      
}

/**
 * Main WC Code Interface
 */
export interface IWCCode {
    _id: ObjectId;
    codeNumber: string;
    category: string;
    description: string;
    type: WCCodeType;          // 'standard' or 'custom'
    tenantId: string;
    userId: string;
    isActive: boolean;
    duplicateHash: string | null;
    vectorIngestionStatus: KnowledgeBaseIngestionStatus | null; // derived at list time from knowledge_base collection
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
    deletedAt: Date | null;    // Soft delete
}

export const WCCodesFillableFields: FillableField[] = [
    { column: 'codeNumber', columnDataType: 'string' },
    { column: 'category', columnDataType: 'string' },
    { column: 'description', columnDataType: 'string' },
    { column: 'duplicateHash', columnDataType: 'string' },
    { column: 'type', columnDataType: 'string' },
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'userId', columnDataType: 'string' },
    { column: 'isActive', columnDataType: 'boolean' },
    ...GeneralFillables
];

/**
 * DTO for creating WC code
 */
export interface ICreateWCCodeDTO {
    codeNumber: string;
    category: string;
    description: string;
}

/**
 * DTO for updating WC code
 */
export interface IUpdateWCCodeDTO {
    codeNumber?: string;
    category?: string;
    description?: string;
}

/**
 * DTO for listing WC codes with filters
 */
export interface IListWCCodesDTO {
    searchText?: string;
    continuationToken?: number;
    pageSize?: number;
}

/**
 * Paginated list response returned by listWCCodes
 */
export interface IWCCodesPaginatedResult {
    searchResult: IWCCode[];
    pagination: {
        lastPage: boolean;
        firstPage: number;
        count: number;
        continuationToken: string | null;
        total: number;
    };
}

/**
 * CSV Import Response Interface
 */
export interface IImportWCCodesResponse {
    success: number;
    failed: number;
    total: number;
    imported: IWCCode[];
    errors: Array<{
        row: number;
        codeNumber: string;
        error: string;
    }>;
}

/**
 * Response field projections for optimized queries
 */
export const listWCCodesResponseFields = [
    '_id',
    'codeNumber',
    'category',
    'description',
    'type',
    'userId',
    'isActive',
    'createdAt',
    'tenantId',
];

export const optimizedWCCodeResponseFields = [
    '_id',
    'codeNumber',
    'category',
    'description',
    'type',
    'tenantId',
    'userId',
    'isActive',
    'createdAt',
    'createdBy',
    'updatedAt',
    'updatedBy'
];
