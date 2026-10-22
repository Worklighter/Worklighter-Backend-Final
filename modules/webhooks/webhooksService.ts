import AzureBlobStorage from '../../integration/azure/azureBlobStorage';
import OnboardingRepository from '../company/companyRepository';
import EmailSubmissionsService from '../emailSubmissions/emailSubmissionsService';
import EmailSubmissionsRepository from '../emailSubmissions/emailSubmissionsRepository';
import { Readable } from 'stream';
import StatusTypes from '../../core/enums/statusTypes';
import EmailsJobProcessor from '../../core/jobs/emailsJobProcessor';
import AuditLogger from '../../utils/helpers/auditLogger';
import AuditEventTypes from '../../core/enums/auditEventTypes';
import { Logger } from '../../utils/helpers/logger';
import SecurityManager from '../../utils/helpers/securityManager';
import Redis from '../../integration/redis';
import ReviewQueues from '../../core/enums/reviewQueues';
import BlobContentDisposition from '../../core/enums/blobContentDisposition';

const extractEmailIdentity = (value?: string): string => {
    const trimmed = value?.trim();
    if (!trimmed) {
        return '';
    }

    const angleBracketMatch = trimmed.match(/<([^>]+)>/);
    if (angleBracketMatch?.[1]) {
        return angleBracketMatch[1].trim();
    }

    const emailMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch?.[0]) {
        return emailMatch[0].trim();
    }

    return trimmed;
};

const buildReadableBlobFolderName = (value?: string): string => {
    const identity = extractEmailIdentity(value) || value?.trim() || 'unknown-sender';

    const normalized = identity
        .replace(/^mailto:/i, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    return normalized || 'unknown-sender';
};

class WebhooksService {

    //* -------------------------------------------------------------------------- */
    //*                       PROCESS INBOUND EMAIL METHOD                         */
    //* -------------------------------------------------------------------------- */
    async processInboundEmail(body: any, attachments: Express.Multer.File[]): Promise<void> {
        const { recipient, sender, from, subject, 'body-plain': bodyPlain, 'stripped-text': strippedText, 'Message-Id': messageId } = body;

        const senderEmail = sender || from;
        const recipientEmail = recipient;
        const inboundEmailSubject = subject;
        const inboundEmailBody = strippedText || bodyPlain || '';
        const threadId = messageId || '';

        //* -------------------------------------------------------------------------- */
        //*                            IDEMPOTENCY GUARD                               */
        //* -------------------------------------------------------------------------- */
        let attachmentFingerprint = '';
        if (attachments?.length > 0) {
            const sortedBuffers = [...attachments]
                .sort((a, b) => a.originalname.localeCompare(b.originalname))
                .map(f => f.buffer);
            attachmentFingerprint = SecurityManager.generateSHA256Hash(sortedBuffers);
        }

        const lockKey = `webhook:lock:${threadId}:${attachmentFingerprint}`;
        const lockAcquired = await this.withTimeout(
            Redis.getInstance().acquireLock(lockKey, 30000),
            5000,
            `Timed out acquiring Mailgun webhook lock for threadId=${threadId || 'N/A'}`
        );

        if (!lockAcquired) {
            Logger.Log(`Concurrent duplicate Mailgun webhook blocked by lock for threadId=${threadId}`, 'warn');
            return;
        }

        try {
            if (threadId && attachmentFingerprint) {
                const isDuplicate = await EmailSubmissionsRepository.getInstance().submissionExistsForDelivery(threadId, attachmentFingerprint);
                if (isDuplicate) {
                    Logger.Log(`Duplicate Mailgun webhook detected for threadId=${threadId} — dropping silently`, 'warn');
                    return;
                }
            }

            const workflowData = await OnboardingRepository.getInstance().getTenantByEmail(recipientEmail);

            if (!workflowData) {
                return;
            }

            const { tenantId, connectedWorkflows } = workflowData;
            const reviewQueue = ReviewQueues.UNCLASSIFIED;

            const folderPath = buildReadableBlobFolderName(senderEmail || from || recipientEmail);

            const uploadedAttachments = [];

            if (attachments?.length > 0) {
                for (let i = 0; i < attachments.length; i++) {
                    const file = attachments[i];
                    try {
                        const stream = Readable.from(file.buffer);
                        const url = await AzureBlobStorage.getInstance().uploadToFolder(stream, file.originalname, folderPath, BlobContentDisposition.INLINE, tenantId);

                        uploadedAttachments.push({
                            filename: file.originalname,
                            mimeType: file.mimetype,
                            size: file.size,
                            order: i + 1,
                            url,
                            aiAnalysisStatus: StatusTypes.PENDING,
                        });
                    } catch (error) {
                        Logger.Log(`Inbound attachment upload failed: filename=${file.originalname}, error=${error?.message || error}`, 'error');
                    }
                }
            }

            if (attachments?.length > 0 && uploadedAttachments.length === 0) {
                Logger.Log(`Inbound email had attachments but none uploaded; no submissions will be created`, 'error');
            }

            // Each attachment is created as an individual standalone submission.
            // Queue-based batch grouping (parent creation) happens post-classification
            // in the job processor once the document type is known — so invoices and
            // daily logs in the same email end up under separate queue-scoped parents.
            for (const attachment of uploadedAttachments) {
                const submissionId = await EmailSubmissionsService.createSubmission({
                    reviewQueue,
                    senderEmail,
                    recipientEmail,
                    inboundEmailSubject,
                    inboundEmailBody,
                    tenantId,
                    threadId,
                    attachment,
                    attachmentFingerprint,
                });

                void AuditLogger.write({
                    submissionId,
                    tenantId,
                    reviewQueue,
                    event: AuditEventTypes.DOCUMENT_RECEIVED,
                    metadata: {
                        senderEmail,
                        recipientEmail,
                        subject: inboundEmailSubject,
                        threadId,
                        attachmentCount: uploadedAttachments.length,
                    },
                });

                void AuditLogger.write({
                    submissionId,
                    attachmentOrder: attachment.order,
                    tenantId,
                    reviewQueue,
                    event: AuditEventTypes.FILE_UPLOADED_TO_BLOB,
                    metadata: {
                        filename: attachment.filename,
                        mimeType: attachment.mimeType,
                        size: attachment.size,
                        blobUrl: attachment.url,
                    },
                });

                EmailsJobProcessor.getInstance().enqueueDocumentProcessingJob({
                    emailSubmissionId: submissionId,
                    attachmentUrl: attachment.url,
                    attachmentFilename: attachment.filename,
                    attachmentMimeType: attachment.mimeType,
                    attachmentSize: attachment.size,
                    attachmentOrder: attachment.order,
                    reviewQueue,
                    tenantId,
                    senderEmail,
                    recipientEmail,
                    inboundEmailSubject,
                    inboundEmailBody,
                    threadId,
                    connectedWorkflows,
                });

                void AuditLogger.write({
                    submissionId,
                    attachmentOrder: attachment.order,
                    tenantId,
                    reviewQueue,
                    event: AuditEventTypes.JOB_ENQUEUED,
                    metadata: { filename: attachment.filename, queue: 'documentProcessing' },
                });
            }
        } finally {
            await Redis.getInstance().releaseLock(lockKey);
        }
    }



    //* -------------------------------------------------------------------------- */
    //*                         TIMEOUT HANDLING METHOD                            */
    //* -------------------------------------------------------------------------- */
    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
        let timeout: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeout);
        }
    }
}



export default new WebhooksService();
