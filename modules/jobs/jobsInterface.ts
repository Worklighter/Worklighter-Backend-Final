import FillableField from "../../core/interfaces/fillableFields";
import { GeneralFillables } from "../../core/interfaces/generalInterface";
import StatusTypes from "../../core/enums/statusTypes";

export interface IJob {
    _id?: string;
    companyId: string;
    jobName: string;
    jobNumber: string;
    status: StatusTypes.JOB_ACTIVE | StatusTypes.JOB_INACTIVE;
    jobAddress?: string;
    city: string;
    state: string;
    zipCode: string;

    // Invoice Email Configuration
    invoiceRecipients: string[];
    invoiceCcRecipients: string[];
    includeInvoiceSubmitter: boolean;

    // Daily Log Email Configuration
    dailyLogRecipients: string[];
    dailyLogCcRecipients: string[];
    includeDailyLogSubmitter: boolean;

    // Metadata
    tenantId: string;
    createdBy: string;
    createdAt: string;
    updatedAt?: string;
    updatedBy?: string;
    deletedAt?: string;
}

export interface ICreateJobDTO {
    jobName: string;
    jobNumber?: string;
    status?: StatusTypes.JOB_ACTIVE | StatusTypes.JOB_INACTIVE;
    jobAddress?: string;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;

    // Invoice Email Configuration
    invoiceRecipients?: string[];
    invoiceCcRecipients?: string[];
    includeInvoiceSubmitter?: boolean;

    // Daily Log Email Configuration
    dailyLogRecipients?: string[];
    dailyLogCcRecipients?: string[];
    includeDailyLogSubmitter?: boolean;
}

export interface IUpdateJobDTO {
    jobId: string;
    jobName?: string;
    jobNumber?: string;
    status?: StatusTypes.JOB_ACTIVE | StatusTypes.JOB_INACTIVE;
    jobAddress?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;

    // Invoice Email Configuration
    invoiceRecipients?: string[];
    invoiceCcRecipients?: string[];
    includeInvoiceSubmitter?: boolean;

    // Daily Log Email Configuration
    dailyLogRecipients?: string[];
    dailyLogCcRecipients?: string[];
    includeDailyLogSubmitter?: boolean;
}

export interface IListJobsDTO {
    searchText?: string;
    status?: 'all' | StatusTypes.JOB_ACTIVE | StatusTypes.JOB_INACTIVE;

    continuationToken?: number;
    pageSize?: number;
}

export interface IJobStatistics {
    totalJobs: number;
    activeJobs: number;
    inactiveJobs: number;
}

export interface IListJobsResponse {
    statistics: IJobStatistics;
    jobs: IJob[];
    continuationToken: string | null;
}

export const JobFillableFields: FillableField[] = [
    { column: 'companyId', columnDataType: 'string' },
    { column: 'jobName', columnDataType: 'string' },
    { column: 'jobNumber', columnDataType: 'string' },
    { column: 'status', columnDataType: 'string' },
    { column: 'jobAddress', columnDataType: 'string' },
    { column: 'city', columnDataType: 'string' },
    { column: 'state', columnDataType: 'string' },
    { column: 'zipCode', columnDataType: 'string' },
    { column: 'invoiceRecipients', columnDataType: 'array' },
    { column: 'invoiceCcRecipients', columnDataType: 'array' },
    { column: 'includeInvoiceSubmitter', columnDataType: 'boolean' },
    { column: 'dailyLogRecipients', columnDataType: 'array' },
    { column: 'dailyLogCcRecipients', columnDataType: 'array' },
    { column: 'includeDailyLogSubmitter', columnDataType: 'boolean' },
    { column: 'tenantId', columnDataType: 'string' },
    ...GeneralFillables
];

export const jobResponseFields = [
    '_id',
    'companyId',
    'jobName',
    'jobNumber',
    'status',
    'jobAddress',
    'city',
    'state',
    'zipCode',
    'invoiceRecipients',
    'invoiceCcRecipients',
    'includeInvoiceSubmitter',
    'dailyLogRecipients',
    'dailyLogCcRecipients',
    'includeDailyLogSubmitter',
    'tenantId',
    'createdAt',
    'createdBy',
    'updatedAt',
    'updatedBy'
];