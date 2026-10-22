import FillableField from "../../core/interfaces/fillableFields";
import { GeneralFillables } from "../../core/interfaces/generalInterface";

export interface IAlertSchedule {
    id: string;
    days: number;
    enabled: boolean;
}

export interface ICoiAlertConfig {
    _id?: string;
    tenantId: string;
    userId: string;
    externalAlertMode: 'manual' | 'auto';
    externalSchedules: IAlertSchedule[];
    sendFinalAlertOnExpiration: boolean;
    internalAlertMode: 'manual' | 'auto';
    internalSchedules: IAlertSchedule[];
    internalCCRecipients: string[];
    sendFinalInternalAlert: boolean;
    createdAt: string;
    updatedAt?: string;
}

export const CoiAlertConfigFillableFields: FillableField[] = [
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'userId', columnDataType: 'string' },
    { column: 'externalAlertMode', columnDataType: 'string' },
    { column: 'externalSchedules', columnDataType: 'array' },
    { column: 'sendFinalAlertOnExpiration', columnDataType: 'boolean' },
    { column: 'internalAlertMode', columnDataType: 'string' },
    { column: 'internalSchedules', columnDataType: 'array' },
    { column: 'internalCCRecipients', columnDataType: 'array' },
    { column: 'sendFinalInternalAlert', columnDataType: 'boolean' },
    ...GeneralFillables
];

export interface IUpdateAlertConfigDTO {
    externalAlertMode?: 'manual' | 'auto';
    externalSchedules?: IAlertSchedule[];
    sendFinalAlertOnExpiration?: boolean;
    internalAlertMode?: 'manual' | 'auto';
    internalSchedules?: IAlertSchedule[];
    internalCCRecipients?: string[];
    sendFinalInternalAlert?: boolean;
}

export const alertConfigResponseFields = [
    'externalAlertMode',
    'externalSchedules',
    'sendFinalAlertOnExpiration',
    'internalAlertMode',
    'internalSchedules',
    'internalCCRecipients',
    'sendFinalInternalAlert'
];
