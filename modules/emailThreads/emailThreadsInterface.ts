import FillableField from "../../core/interfaces/fillableFields";
import { GeneralFillables } from "../../core/interfaces/generalInterface";

export interface IEmailThreads {
    _id: string,
    threadId: string,
    subject: string,
    emailContent: string,
    sentBy: string,
    createdAt: string,
    createdBy: string,
    updatedAt: string,
    updatedBy: string,
    deletedAt: string
}



export const EmailThreadFillableFields: FillableField[] = [
    { column: 'threadId', columnDataType: 'string' },
    { column: 'subject', columnDataType: 'string' },
    { column: 'emailContent', columnDataType: 'string' },
    { column: 'sentBy', columnDataType: 'string' },
    ...GeneralFillables
];