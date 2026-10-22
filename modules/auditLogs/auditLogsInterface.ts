import AuditEventTypes from "../../core/enums/auditEventTypes";


export interface IAuditActor {
    type: 'system' | 'user';
    id?: string;
    name?: string;
}


export interface IAuditLog {
    _id?: string;
    submissionId: string;
    attachmentOrder?: number;
    tenantId: string;
    reviewQueue?: string;

    event: AuditEventTypes;
    actor: IAuditActor;
    timestamp: string;

    metadata?: Record<string, any>;

    before?: Record<string, any>;
    after?: Record<string, any>;
}


export interface IWriteAuditEventDTO {
    submissionId: string;
    attachmentOrder?: number;
    tenantId: string;
    reviewQueue?: string;
    event: AuditEventTypes;
    actor?: IAuditActor;
    metadata?: Record<string, any>;
    before?: Record<string, any>;
    after?: Record<string, any>;
}
