import FillableField from "../../core/interfaces/fillableFields"
import { GeneralFillables } from "../../core/interfaces/generalInterface"
import DocumentTypes from "../../core/enums/documentTypes"
import { ScoreBreakdown, RoutingDecision } from "../../ai/scorers/documentScorer"

export interface IEmailSubmissions {
    _id: string,
    reviewQueue: string,
    senderEmail: string,
    recipientEmail: string,
    inboundEmailSubject: string,
    inboundEmailBody: string,
    tenantId: string,
    threadId: string,
    emailStatus: string,
    aiAnalysisStatus: string,
    attachments: EmailSubmissionAttachmentStructure[],
    parentSubmissionId?: string,
    splitIndex?: number,
    isBatchDocument?: boolean,
    splitDocumentCount?: number,
    attachmentFingerprint?: string,
    createdAt: string,
    createdBy: string,
    updatedAt: string,
    updatedBy: string,
    deletedAt: string
}



export interface IInvoiceLineItemStructure {
    itemName: string,
    itemCost: number,
    mappedCostCode: string,
    currency: string
}



export interface IInvoicesEmailSubmission extends IEmailSubmissions {
    aiAnalysisReport: {
        confidence: number,
        vendor: string,
        invoiceNumber: string,
        invoiceDate: string,
        invoiceDueDate: string,
        amount: number,
        currency: string,
        job: string,
        lineItems: IInvoiceLineItemStructure[],
        notes: string,
        qaConfidence: number,
        qaReasoning: string,
        routingDecision: RoutingDecision,
        scoreBreakdown: ScoreBreakdown | null,
    }
}



export interface ITaskStructure {
    taskName: string,
    mappedCostCode: string,
    //* null when hours cannot be tied to this specific task (Pattern B/C).
    hoursWorked: number | null,
}

export interface ICrewMemberStructure {
    name: string,
    trade: string,
    //* Verbatim from the document — decimal ("8", "7.5") or time range ("8:00 to 15:38").
    rawHours: string,
}

export interface IDailyLogsEmailSubmission extends IEmailSubmissions {
    aiAnalysisReport: {
        confidence: number,
        date: string,
        superintendent: string,
        job: string,
        tasks: ITaskStructure[],
        //* Crew members extracted from the labour/personnel table, if present.
        crew: ICrewMemberStructure[],
        //* Computed by code (not LLM) from crew[].rawHours. null if no crew table exists.
        totalCrewHours: number | null,
        equipment: string,
        qaConfidence: number,
        qaReasoning: string,
        routingDecision: RoutingDecision,
        scoreBreakdown: ScoreBreakdown | null,
    }
}



export interface ICoverageItem {
    coveredProperty: string,
    amountOfInsurance: string,
}

export interface IComplianceAlertsEmailSubmission extends IEmailSubmissions {
    aiAnalysisReport: {
        confidence: number,
        vendor: string,
        certificate: string,
        documentType: string,
        insurer: string,
        policyNumber: string[],
        effectiveDate: string,
        expirationDate: string,
        isExpired: boolean,
        isExpiringSoon: boolean,
        isCompliant: boolean,
        coverage: ICoverageItem[],
        qaConfidence: number,
        qaReasoning: string,
        routingDecision: RoutingDecision,
        scoreBreakdown: ScoreBreakdown | null,
    }
}




export const EmailSubmissionFillableFields: FillableField[] = [
    { column: 'reviewQueue', columnDataType: 'string' },
    { column: 'senderEmail', columnDataType: 'string' },
    { column: 'recipientEmail', columnDataType: 'string' },
    { column: 'inboundEmailSubject', columnDataType: 'string' },
    { column: 'inboundEmailBody', columnDataType: 'string' },
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'threadId', columnDataType: 'string' },
    { column: 'emailStatus', columnDataType: 'string' },
    { column: 'aiAnalysisStatus', columnDataType: 'string' },
    { column: 'attachments', columnDataType: 'array' },
    { column: 'parentSubmissionId', columnDataType: 'string' },
    { column: 'splitIndex', columnDataType: 'number' },
    { column: 'isBatchDocument', columnDataType: 'boolean' },
    { column: 'splitDocumentCount', columnDataType: 'number' },
    ...GeneralFillables
];




export const listEmailSubmissionsResponseFields = [
    '_id',
    'reviewQueue',
    'senderEmail',
    'recipientEmail',
    'inboundEmailSubject',
    'inboundEmailBody',
    'tenantId',
    'threadId',
    'emailStatus',
    'aiAnalysisStatus',
    'aiAnalysisReport',
    'attachments',
    'createdAt',
    'isBatchDocument',
    'splitDocumentCount',
    'parentSubmissionId',
    'splitIndex',
];




export interface ICreateEmailSubmissionDTO {
    reviewQueue: string;
    senderEmail: string;
    recipientEmail: string;
    inboundEmailSubject: string;
    inboundEmailBody: string;
    tenantId: string;
    threadId: string;
    attachment: EmailSubmissionAttachmentStructure;
    parentSubmissionId?: string;
    splitIndex?: number;
    attachmentFingerprint?: string;
}

export interface ICreateBatchParentSubmissionDTO {
    reviewQueue: string;
    senderEmail: string;
    recipientEmail: string;
    inboundEmailSubject: string;
    inboundEmailBody: string;
    tenantId: string;
    threadId: string;
    splitDocumentCount: number;
    attachments: Pick<EmailSubmissionAttachmentStructure, 'filename' | 'mimeType' | 'size' | 'order' | 'url'>[];
    attachmentFingerprint: string;
}



export interface EmailAnalysisJobMetaData {
    reviewQueue: string,
    senderEmail: string,
    recipientEmail: string,
    inboundEmailSubject: string,
    inboundEmailBody: string,
    attachments: EmailSubmissionAttachmentStructure[],
    tenantId: string,
    threadId: string,
}



export interface ITokenModelUsage {
    model: string;
    inputTokens: number;
    outputTokens: number;
}

export interface ITokenConsumptionReceipt {
    //* Grand totals across all models
    inputTokens: number;
    outputTokens: number;
    totalUsage: number;
    //* Per-agent breakdown — populated when separate models are configured
    classifier?: ITokenModelUsage;
    extraction?: ITokenModelUsage;
    qa?: ITokenModelUsage;
}

export interface IClassificationResult {
    documentType: DocumentTypes;
    confidence: number;
    misrouted: boolean;
    suggestedQueue?: string | null;
}

export interface EmailSubmissionAttachmentStructure {
    filename: string;
    mimeType: string;
    size: number;
    order: number;
    url: string;
    aiAnalysisStatus?: string;
    aiAnalysisReport?: any;
    flaggedForHumanReview?: boolean;
    tokenConsumptionReceipt?: ITokenConsumptionReceipt;
    classificationResult?: IClassificationResult;
    mappedJobId?: string | null;
}

export interface DocumentProcessingJobMetaData {
    emailSubmissionId: string;
    attachmentUrl: string;
    attachmentFilename: string;
    attachmentMimeType: string;
    attachmentSize: number;
    attachmentOrder: number;
    reviewQueue: string;
    tenantId: string;
    senderEmail: string;
    recipientEmail: string;
    inboundEmailSubject: string;
    inboundEmailBody: string;
    threadId: string;
    //* When this submission is a file-level child of an email-batch parent, this holds
    //* the batch parent's id.  The segmenter uses it so that any segment-children it
    //* spawns are linked to the same batch parent rather than to the file-level submission.
    parentSubmissionId?: string;
    //* Set by batch segmenter — child submissions skip blob download, OCR, classification,
    //* and page segmentation; they start directly from AI extraction.
    preExtractedContent?: string;
    //* Set to true for child submissions spawned from batch segmentation.
    //* Skips classification and page segmentation — the parent already ran both.
    //* Does NOT skip blob download or OCR: the child re-extracts from its own split PDF
    //* so the extraction agent always receives clean, complete content.
    isChildSubmission?: boolean;
    //* Set when a misrouted document is auto-corrected — skips the classifier re-run
    //* so the same document isn't re-classified (and potentially re-misrouted) on the second pass.
    autoCorrectRequeue?: boolean;
    //* Passed from parent to child submissions so child jobs store the same
    //* classification result without re-running the classifier.
    inheritedClassification?: IClassificationResult;
    //* Workflows the company has enabled. Used after classification to reject
    //* documents whose type is not in the company's active workflow set.
    connectedWorkflows?: string[];
}

export type CoiExpiringSoonAlertRecipientType = 'internal' | 'external';

export interface CoiExpiringSoonAlertJobMetaData {
    emailSubmissionId: string;
    tenantId: string;
    recipientType: CoiExpiringSoonAlertRecipientType;
    recipients: string[];
    vendorName?: string;
    vendorEmail?: string;
    expirationDate: string;
    daysUntilExpiration: number;
    inboundEmailSubject?: string;
    reviewQueue: string;
}

export interface ISegmenterResult {
    isSingleDocument: boolean;
    segments: string[];
}

export interface IListEmailSubmissionsDTO {
    submissionStatus?: string;
    reviewQueue?: string;
    pageSize?: number;
    continuationToken?: number;
}


export interface IUpdateInvoiceStatusDTO {
    emailSubmissionId: string;
    status: string;
    mappedJobId?: string | null;
    aiAnalysisReport: {
        vendor: string;
        invoiceNumber: string;
        invoiceDate: string;
        invoiceDueDate: string | null;
        amount: number;
        currency: string;
        job: string;
        lineItems: IInvoiceLineItemStructure[];
        notes: string;
    };
}

export interface IUpdateDailyLogStatusDTO {
    emailSubmissionId: string;
    status: string;
    attachmentOrder: number;
    mappedJobId?: string | null;
    aiAnalysisReport: {
        date: string;
        superintendent: string;
        job: string;
        tasks: ITaskStructure[];
        equipment: string;
    };
}

export interface IUpdateComplianceAlertStatusDTO {
    emailSubmissionId: string;
    attachmentOrder: number;
    aiAnalysisReport: {
        vendor: string;
        certificate: string;
        documentType: string;
        insurer: string;
        policyNumber: string[];
        effectiveDate: string;
        expirationDate: string;
        coverage: ICoverageItem[];
    };
}

export interface IUpdateSubmissionStatusParamsDTO {
    emailSubmissionId: string;
}

export interface IUpdateSubmissionStatusBodyDTO {
    status: string;
}
