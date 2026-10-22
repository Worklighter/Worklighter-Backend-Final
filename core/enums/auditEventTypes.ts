enum AuditEventTypes {
    // ── Inbound pipeline ──────────────────────────────────────────────────────
    DOCUMENT_RECEIVED          = 'document_received',           // Email arrived, EmailSubmission created
    FILE_UPLOADED_TO_BLOB      = 'file_uploaded_to_blob',       // Attachment stored in Azure Blob
    JOB_ENQUEUED               = 'job_enqueued',                // BullMQ processing job queued

    // ── Content extraction ────────────────────────────────────────────────────
    CONTENT_EXTRACTED          = 'content_extracted',           // OCR or direct text extraction result

    // ── Document classification (Layer 1) ─────────────────────────────────────
    DOCUMENT_CLASSIFIED        = 'document_classified',         // Classifier agent result
    DOCUMENT_MISROUTED         = 'document_misrouted',          // Wrong queue detected
    MISROUTED_REQUEUED         = 'misrouted_requeued',          // Auto-corrected to suggested queue and re-enqueued
    DOCUMENT_UNCLASSIFIABLE    = 'document_unclassifiable',     // Unknown type / low confidence

    // ── Document segmentation ─────────────────────────────────────────────────
    DOCUMENT_SEGMENTED         = 'document_segmented',          // Multi-doc split into N children
    CHILD_JOB_ENQUEUED         = 'child_job_enqueued',          // Each child job queued after split

    // ── AI extraction pipeline ────────────────────────────────────────────────
    EXTRACTION_STARTED         = 'extraction_started',          // LangGraph pipeline begins
    EXTRACTION_ITERATION       = 'extraction_iteration',        // Per-iteration extraction result
    QA_INSPECTION              = 'qa_inspection',               // Per-iteration QA agent result
    EXTRACTION_COMPLETED       = 'extraction_completed',        // Final extracted data stored
    EXTRACTION_FAILED          = 'extraction_failed',           // No graph result returned

    // ── Escalation ────────────────────────────────────────────────────────────
    FLAGGED_FOR_HUMAN_REVIEW   = 'flagged_for_human_review',    // Max iterations / low confidence

    // ── Cost tracking ─────────────────────────────────────────────────────────
    TOKEN_USAGE_RECORDED       = 'token_usage_recorded',        // Token receipt stored per job

    // ── Human review actions ──────────────────────────────────────────────────
    STATUS_CHANGED             = 'status_changed',              // Any status mutation
    HUMAN_APPROVED             = 'human_approved',              // Reviewer approved document
    HUMAN_REJECTED             = 'human_rejected',              // Reviewer rejected document
    HUMAN_EDITED               = 'human_edited',                // Reviewer edited extracted data (before/after diff)
    REPROCESSING_REQUESTED     = 'reprocessing_requested',      // Document sent back through pipeline

    // â”€â”€ Admin / support actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    TENANT_SUSPENDED           = 'tenant_suspended',
    TENANT_REACTIVATED         = 'tenant_reactivated',
    TENANT_IMPERSONATED        = 'tenant_impersonated',
    USER_FORCE_LOGGED_OUT      = 'user_force_logged_out',
    PASSWORD_RESET_REQUESTED   = 'password_reset_requested',
    PLAN_CREATED               = 'plan_created',
    PLAN_UPDATED               = 'plan_updated',
    SUBSCRIPTION_TERMINATED    = 'subscription_terminated',
}

export default AuditEventTypes;
