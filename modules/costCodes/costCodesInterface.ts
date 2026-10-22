import FillableField from "../../core/interfaces/fillableFields";
import { GeneralFillables } from "../../core/interfaces/generalInterface";
import KnowledgeBaseIngestionStatus from "../../core/enums/knowledgeBaseIngestionStatus";

/**
 * ╔═══════════════════════════════════════╗
 * ║         COST CODES INTERFACES         ║
 * ╚═══════════════════════════════════════╝
 */



export enum CostCodeType {
    STANDARD = 'standard',  
    CUSTOM = 'custom'       
}

export interface ICostCode {
    _id: string;
    codeNumber: string;
    category: string;
    description: string;
    type: CostCodeType;           // 'standard' or 'custom'
    tenantId: string;
    isActive: boolean;
    createdAt: string;
    createdBy: string;
    updatedAt?: string | null;
    updatedBy?: string | null;
    deletedAt?: string | null;
    vectorIngestionStatus?: KnowledgeBaseIngestionStatus | null;
}

/**
 * DTO for creating a new cost code
 */
export interface ICreateCostCodeDTO {
    codeNumber: string;
    category: string;
    description: string;
}

/**
 * DTO for updating a cost code
 */
export interface IUpdateCostCodeDTO {
    codeNumber?: string;
    category?: string;
    description?: string;
}

/**
 * Paginated list response returned by listCostCodes
 */
export interface ICostCodesPaginatedResult {
    searchResult: ICostCodeWithCompany[];
    pagination: {
        lastPage: boolean;
        firstPage: number;
        count: number;
        continuationToken: string | null;
        total: number;
    };
}

/**
 * DTO for listing cost codes with search and pagination
 */
export interface IListCostCodesDTO {
    searchText?: string;
    continuationToken?: number;
    pageSize?: number;
}

/**
 * DTO for CSV import
 */
export interface IImportCostCodesDTO {
    file: Express.Multer.File;
}

/**
 * Response for CSV import with detailed results
 */
export interface IImportCostCodesResponse {
    success: number;
    failed: number;
    total: number;
    imported: ICostCodeWithCompany[];
    errors: {
        row: number;
        codeNumber: string;
        error: string;
    }[];
}

export interface ICostCodeWithCompany extends ICostCode {
    companyId: string | null;
    userId: string;
}

/**
 * Fillable fields for cost codes
 */
export const CostCodeFillableFields: FillableField[] = [
    { column: 'codeNumber', columnDataType: 'string' },
    { column: 'category', columnDataType: 'string' },
    { column: 'description', columnDataType: 'string' },
    { column: 'type', columnDataType: 'string' },
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'isActive', columnDataType: 'boolean' },
    ...GeneralFillables
];

/**
 * Response fields for optimized queries
 */
export const optimizedCostCodeResponseFields = [
    '_id',
    'codeNumber',
    'category',
    'description',
    'type',
    'tenantId',
    'isActive',
    'createdAt',
    'createdBy',
    'updatedAt',
    'updatedBy'
];

/**
 * Response fields for list view
 */
export const listCostCodesResponseFields = [
    '_id',
    'tenantId',
    'codeNumber',
    'category',
    'description',
    'type',
    'isActive',
    'createdAt'
];
