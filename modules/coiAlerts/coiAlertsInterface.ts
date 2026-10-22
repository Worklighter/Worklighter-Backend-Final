import FillableField from "../../core/interfaces/fillableFields";
import { GeneralFillables } from "../../core/interfaces/generalInterface";

export interface IAutoExternal {
    days: number[];
}

export interface IExternalAlerts {
    mode: ('Manual' | 'Auto')[];
    auto?: IAutoExternal;
}

export interface IAutoInternal {
    schedule: number[];
    ccRecipients?: string[];
}

export interface IInternalAlerts {
    mode: ('Manual' | 'Auto')[];
    auto?: IAutoInternal;
}

export interface ICoiAlerts {
    external: IExternalAlerts;
    internal: IInternalAlerts;
}

export interface ICoiVendor {
    _id: string;
    userId: string;
    companyId?: string;
    tenantId: string;
    vendorName: string;
    vendorEmail: string;
    coiExpirationDate?: Date | string | null;
    coiDocument?: string | null;
    status?: 'active' | 'expiring_soon' | 'expired';
    alerts: ICoiAlerts;
    emailTemplate?: string;
    emailSubject?: string;
    emailBody?: string;
    ccRecipients?: string[];
    createdAt: string;
    createdBy: string;
    updatedAt?: string | null;
    updatedBy?: string | null;
    deletedAt?: string | null;
}

export const CoiVendorFillableFields: FillableField[] = [
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'userId', columnDataType: 'string' },
    { column: 'companyId', columnDataType: 'string' },
    { column: 'vendorName', columnDataType: 'string' },
    { column: 'vendorEmail', columnDataType: 'string' },
    { column: 'coiDocument', columnDataType: 'string' },
    { column: 'coiExpirationDate', columnDataType: 'date' },
    { column: 'status', columnDataType: 'string' },
    { column: 'alerts', columnDataType: 'object' },
    { column: 'emailTemplate', columnDataType: 'string' },
    { column: 'emailSubject', columnDataType: 'string' },
    { column: 'emailBody', columnDataType: 'string' },
    { column: 'ccRecipients', columnDataType: 'array' },
    ...GeneralFillables
];

export interface ICreateVendorDTO {
    vendorName: string;
    vendorEmail: string;
    coiExpirationDate?: string;
    coiDocument?: string;
    alerts?: ICoiAlerts;
    emailTemplate?: string;
    emailSubject?: string;
    emailBody?: string;
    ccRecipients?: string[];
}

export interface IUpdateVendorDTO {
    vendorId: string;
    vendorName?: string;
    vendorEmail?: string;
    coiExpirationDate?: string;
    coiDocument?: string;
    alerts?: ICoiAlerts;
    emailTemplate?: string;
    emailSubject?: string;
    emailBody?: string;
    ccRecipients?: string[];
}

export interface IGetVendorsDTO {
    searchText?: string;
    continuationToken?: number;
    pageSize?: number;
    status?: 'active' | 'expiring_soon' | 'expired';
}

export interface IVendorStatsResponse {
    totalVendors: number;
    activeCOIs: number;
    expiringSoon: number;
    expired: number;
}

export const vendorResponseFields = [
    '_id',
    'vendorName',
    'vendorEmail',
    'coiDocument',
    'coiExpirationDate',
    'status',
    'alerts',
    'emailTemplate',
    'emailSubject',
    'emailBody',
    'ccRecipients',
    'createdAt',
    'updatedAt'
];

export interface ISendReminderDTO {
    vendorId: string;
    reminderType?: 'standard' | 'urgent' | 'friendly';
}

export interface IUploadCOIDocumentDTO {
    vendorId: string;
}
