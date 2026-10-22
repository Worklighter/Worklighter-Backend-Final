import FillableField from "../../core/interfaces/fillableFields";
import TenantStatus from "../../core/enums/tenantStatus";

/*
 * ╔═══════════════════════════════════════╗
 * ║      COMPANY INFO INTERFACES          ║
 * ╚═══════════════════════════════════════╝
 */

export interface ICompanyInfo {
    _id?: string;        
    ownerId?: string; 
    tenantId?: string;
    companyName: string;
    industry: string;
    companyAddress: string;
    country: string;
    city: string;
    state: string;
    zipCode: string;
    timezone: string;
    companyLogo?: string;
}

export interface IUpdateCompanyInfoDTO {
    _id?: string;        
    ownerId?: string; 
    tenantId?: string;
    companyName?: string;
    industry?: string;
    companyAddress?: string;
    country?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    timezone?: string;
    companyLogo?: string;
}

export const companyInfoResponseFields = [
    '_id',           
    'ownerId',        
    'tenantId', 
    'companyName',
    'industry',
    'companyAddress',
    'country',
    'city',
    'state',
    'zipCode',
    'timezone',
    'companyLogo'
];

export interface IGetOnCompanyDashboardDTO {
    pageSize?: number;
    continuationToken?: number;
    companyName?: string;
    companyStatus?: string;
    planType?: string;
    role?: string;
}

export interface IUpdateCompanyDashboardDTO {
    companyStatus?: string;
}

export interface IGetCompanyBillingDTO {
    pageSize?: number;
    continuationToken?: number;
}

/*
 * ╔═══════════════════════════════════════╗
 * ║      ONBOARDING INTERFACES            ║
 * ╚═══════════════════════════════════════╝
 */

export interface ISelectedWorkflow {
    workflowName: string;
    connected: boolean;
}

export interface ITeamMember {
    id?: string;
    userId?: string;
    email: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    role: string;
    status?: 'Active' | 'Inactive';
    invitedAt?: string;
    joinedAt?: string;
    tenantId?: string;
    username?: string;
    password?: string;
    emailVerifiedAt?: Date | string | null;
    accountStatus?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface ICompany {
    _id?: string;
    ownerId: string;
    tenantId: string;
    tenantStatus?: TenantStatus | string;
    step: number; // Current onboarding step (1-6)
    companyCode: string; // Unique 6-8 character alphanumeric identifier
    assignedEmail?: string | null; // Single inbound email for all workflows: {companyCode}@inbound.worklighter.io

    companyName: string;
    industry: string;
    companyAddress: string;
    country: string;
    city: string;
    state: string;
    zipCode: string;
    timezone: string;
    companyLogo?: string;

    // Step 2: Selected Workflows
    selectedWorkflows?: ISelectedWorkflow[];

    // Step 3: Document Files
    costCodesFiles?: string[];
    workersCompFiles?: string[];

    // Step 4: Expiration Alert Configuration
    expirationAlerts?: string[];
    pmApprovalLimit?: number;
    isPaymentCompleted: boolean;       // true only after Stripe payment confirmed
    isCompleted: boolean;              // true only after payment is confirmed
    completedAt?: string;
    createdAt: string;
    updatedAt?: string;
    lastActivity?: Record<string, string>; // Tracks the latest activity for each workflow
    // Extracted document data from ETL pipeline
    extractedDocumentData?: IDocumentData[];
}

export interface ICompanyDTO {
    step: number; // Current onboarding step (1-6)

    // Step 1: Company Info
    companyName?: string;
    industry?: string;
    companyAddress?: string;
    country?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    timezone?: string;

    // Step 2: Selected Workflows
    selectedWorkflows?: string;

    // Step 3: Cost Codes & Workers Comp (files handled separately)

    // Step 4: Expiration Alert Configuration
    expirationAlerts?: string;

    // Step 5: Approval Limits
    pmApprovalLimit?: string;

    // Step 6: Team Members (handled separately — stored in Users collection, not here)
    teamMembers?: string;

    // Step 6: Confirmation (no additional data)
}

export const CompanyFillableFields: FillableField[] = [
    { column: 'ownerId', columnDataType: 'string' },
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'tenantStatus', columnDataType: 'string' },
    { column: 'step', columnDataType: 'number' },
    { column: 'companyCode', columnDataType: 'string' },
    { column: 'assignedEmail', columnDataType: 'string' },
    { column: 'companyName', columnDataType: 'string' },
    { column: 'industry', columnDataType: 'string' },
    { column: 'companyAddress', columnDataType: 'string' },
    { column: 'country', columnDataType: 'string' },
    { column: 'city', columnDataType: 'string' },
    { column: 'state', columnDataType: 'string' },
    { column: 'zipCode', columnDataType: 'string' },
    { column: 'timezone', columnDataType: 'string' },
    { column: 'companyLogo', columnDataType: 'string' },
    { column: 'selectedWorkflows', columnDataType: 'array' },
    { column: 'costCodesFiles', columnDataType: 'array' },
    { column: 'workersCompFiles', columnDataType: 'array' },
    { column: 'expirationAlerts', columnDataType: 'array' },
    { column: 'pmApprovalLimit', columnDataType: 'number' },
    { column: 'isPaymentCompleted', columnDataType: 'boolean' },
    { column: 'isCompleted', columnDataType: 'boolean' },
    { column: 'completedAt', columnDataType: 'string' },
    { column: 'createdAt', columnDataType: 'string' },
    { column: 'updatedAt', columnDataType: 'string' },
    { column: 'extractedDocumentData', columnDataType: 'array' }
];

/*
 * ╔═══════════════════════════════════════╗
 * ║      DOCUMENT ETL INTERFACES          ║
 * ╚═══════════════════════════════════════╝
 */

export type DocumentType = 'csv' | 'pdf' | 'excel' | 'word' | 'other';

export interface IExtractedData {
    documentType: string;
    rawContent: string;
    headers: string[];
    rows: Record<string, any>[];
    metadata: Record<string, any>;
    recordCount: number;
}

export interface IDocumentData {
    _id?: string;
    userId: string;
    tenantId: string;
    onboardingId: string;
    category: 'cost_codes' | 'workers_comp' | 'compliance';
    fileName: string;
    originalFileName: string;
    documentType: DocumentType;
    mimeType: string;
    fileSize: number;
    headers: string[];
    columnTypes: Record<string, string>;
    data: Record<string, any>[];
    recordCount: number;
    summary: Record<string, any>;
    rawContent: string;
    metadata: Record<string, any>;
    status: 'pending' | 'processing' | 'processed' | 'failed';
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface IUpdateApprovalLimitDTO {
    pmApprovalLimit: number;
}

export interface IApprovalLimitResponse {
    pmApprovalLimit: number;
}
