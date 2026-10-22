import { Job, Queue, Worker } from "bullmq";
import { Application } from "../../app";
import { Logger } from "../../utils/helpers/logger";
import BackgroundJobs from "../enums/backgroundJobs";
import { BackgroundJobSettings, BullmqQueues } from "../../utils/constants";
import os from 'os';
// import GmailManager from "../../integration/gmailManager";
import {
    CoiExpiringSoonAlertJobMetaData,
    DocumentProcessingJobMetaData,
} from "../../modules/emailSubmissions/emailSubmissionsInterface";
import { BullMQ } from "../interfaces/bullMQ";
import EnvironmentTypes from "../enums/environmentTypes";
import AzureBlobStorage from "../../integration/azure/azureBlobStorage";
import AttachmentAnalyzer, { ProcessingMethod } from "../../utils/helpers/attachmentAnalyzer";
import { AzureDocumentIntelligenceService } from "../../integration/azure/docIntelligence";
import InvoicesAgent from "../../ai/agents/invoicesAgent";
import DailyLogsAgent from "../../ai/agents/dailyLogsAgent";
import ComplianceAlertsAgent from "../../ai/agents/complianceAlertsAgent";
import { RoutingDecision } from "../../ai/scorers/documentScorer";
import DocumentClassifierChain from "../../ai/chains/documentClassifierChain";
import DocumentSegmenterChain from "../../ai/chains/documentSegmenterChain";
import PdfSplitter from "../../utils/helpers/pdfSplitter";
import { IClassificationResult } from "../../modules/emailSubmissions/emailSubmissionsInterface";
import TokenUsageHandler from "../../utils/helpers/tokenUsageHandler";
import { LLMClientFactory } from "../../ai/llms/llmClientFactory";
import { HumanMessage } from "@langchain/core/messages";
import DocumentTypes from "../enums/documentTypes";
import AuditLogger from "../../utils/helpers/auditLogger";
import AuditEventTypes from "../enums/auditEventTypes";
import ReviewQueues from "../enums/reviewQueues";
import StatusTypes from "../enums/statusTypes";
import EmailSubmissionsRepository from "../../modules/emailSubmissions/emailSubmissionsRepository";
import EmailSubmissionsService from "../../modules/emailSubmissions/emailSubmissionsService";
import { computeIsExpired, computeComplianceStatus } from "../../ai/utils/extractionSanitizer";
import BlobContentDisposition from "../enums/blobContentDisposition";
import AzureAISearch from "../../integration/azure/aiSearch";
import { IKnowledgeBaseVectorChunk } from "../../modules/knowledgeBase/knowledgeBaseInterface";
import AzureJobsSearch, { JobSearchMatch } from "../../integration/azure/jobsSearch";
import OnboardingRepository from "../../modules/company/companyRepository";
import CostCodesRepository from "../../modules/costCodes/costCodesRepository";
import { ICostCode } from "../../modules/costCodes/costCodesInterface";
import WCCodesRepository from "../../modules/wcCodes/wcCodesRepository";
import { IWCCode } from "../../modules/wcCodes/wcCodesInterface";
import { Utils } from "../../utils/utils";
import EmailTemplateTypes from "../enums/emailTemplateTypes";

class EmailsJobProcessor implements BullMQ {
    private static instance: EmailsJobProcessor | null = null;
    private queues: Record<string, Queue> = {};
    private workers: Record<string, Worker> = {};
    private readonly redisConfig = Application.redisConf;
    private workerConcurrency: number = 3;

    private constructor() { }

    private readonly queueProcessors: { [queueName: string]: (job: Job) => Promise<void> } = {
        'documentProcessing': this.processDocumentAnalysis.bind(this),
        'coiExpiringSoonAlerts': this.processCoiExpiringSoonAlert.bind(this),
    };

    //* PUBLIC FUNCTIONS

    public static getInstance(): EmailsJobProcessor {
        if (!EmailsJobProcessor.instance) {
            EmailsJobProcessor.instance = new EmailsJobProcessor();
        }
        return EmailsJobProcessor.instance;
    }

    public async initQueues(): Promise<void> {
        const queueNames = Object.values(BullmqQueues.EMAILS_QUEUES);
        for (const queueName of queueNames) {
            this.queues[queueName] = new Queue(queueName, {
                connection: { url: this.redisConfig.url },
                defaultJobOptions: {
                    removeOnComplete: true,
                },
            });
        }
        Logger.Console(`Email Analysis Background Job Queues initialized successfully`, 'info');
    }

    public async initWorkers(): Promise<void> {
        const availableCores = os.cpus().length
        this.workerConcurrency = Math.floor(availableCores / 3);

        //* Ensuring that concurrency is at least 1 (so workers can process jobs)
        if (this.workerConcurrency < 1) {
            this.workerConcurrency = 1;
        }

        Object.keys(this.queueProcessors).forEach(async (queueName) => {
            this.workers[queueName] = new Worker(queueName, this.queueProcessors[queueName], {
                connection: { url: this.redisConfig.url },
                concurrency: this.workerConcurrency,
                lockDuration: 300_000, // 5 minutes — prevents stalled-job failure on large doc processing
            });

            await this.setupWorkerEventListeners(this.workers[queueName], queueName);
        });

        Logger.Console(`Workers created for User Job Queues`, 'info');
        this.monitorLoad();
    }



    //* ENQUEUE FUNCTIONS

    public enqueueDocumentProcessingJob(jobData: DocumentProcessingJobMetaData) {
        this.queues[BullmqQueues.EMAILS_QUEUES.DOCUMENT_PROCESSING].add(BackgroundJobs.PROCESS_DOCUMENT_ANALYSIS, jobData, {
            delay: Application.conf.ENV === EnvironmentTypes.LOCAL ? 0 : BackgroundJobSettings.DEFAULT_DELAY_IN_PROCESSING,
            backoff: { type: BackgroundJobSettings.BACKOFF_STRATEGY.backoffType, delay: BackgroundJobSettings.BACKOFF_STRATEGY.backoffDelay },
            attempts: BackgroundJobSettings.MAX_RETRY,
            removeOnFail: BackgroundJobSettings.REMOVE_ON_FAIL
        });
    }

    public async enqueueCoiExpiringSoonAlertJob(jobData: CoiExpiringSoonAlertJobMetaData, jobId: string): Promise<void> {
        await this.queues[BullmqQueues.EMAILS_QUEUES.COI_EXPIRING_SOON_ALERTS].add(
            BackgroundJobs.SEND_COI_EXPIRING_SOON_ALERT,
            jobData,
            {
                jobId,
                delay: 0,
                backoff: { type: BackgroundJobSettings.BACKOFF_STRATEGY.backoffType, delay: BackgroundJobSettings.BACKOFF_STRATEGY.backoffDelay },
                attempts: BackgroundJobSettings.MAX_RETRY,
                removeOnFail: BackgroundJobSettings.REMOVE_ON_FAIL
            }
        );
    }



    //* PRIVATE FUNCTIONS


    //* -------------------------------------------------------------------------- */
    //*                 PROCESS COI EXPIRING SOON ALERT METHOD                     */
    //* -------------------------------------------------------------------------- */
    private async processCoiExpiringSoonAlert(job: Job): Promise<void> {
        const data: CoiExpiringSoonAlertJobMetaData = job.data;
        const templateSlug = data.recipientType === 'internal'
            ? EmailTemplateTypes.COI_EXPIRING_SOON_INTERNAL
            : EmailTemplateTypes.COI_EXPIRING_SOON_EXTERNAL;

        const placeholders = {
            vendorName: data.vendorName || 'Unknown vendor',
            vendorEmail: data.vendorEmail || '',
            expirationDate: this.formatDateForEmail(data.expirationDate),
            daysUntilExpiration: data.daysUntilExpiration,
            emailSubmissionId: data.emailSubmissionId,
            tenantId: data.tenantId,
            inboundEmailSubject: data.inboundEmailSubject || 'N/A',
        };
        const subject = data.recipientType === 'internal'
            ? `COI expiring soon: ${placeholders.vendorName}`
            : 'Certificate of Insurance renewal reminder';

        for (const recipient of data.recipients) {
            await Utils.sendMail(recipient, templateSlug, placeholders, subject);
            Logger.Console(`COI expiring soon ${data.recipientType} alert sent to ${recipient} for submission ${data.emailSubmissionId}`, 'info');
        }
    }

    private formatDateForEmail(date: string): string {
        const parsedDate = new Date(date);
        if (Number.isNaN(parsedDate.getTime())) return date;

        return parsedDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }


    //* -------------------------------------------------------------------------- */
    //*                    PROCESS DOCUMENT ANALYSIS METHOD                        */
    //* -------------------------------------------------------------------------- */
    private async processDocumentAnalysis(job: Job): Promise<void> {
        const data: DocumentProcessingJobMetaData = job.data;
        try {
            console.log(`\n🔄 Processing document for submission: ${data.emailSubmissionId} | Attachment #${data.attachmentOrder}`);

            if (data.inheritedClassification) {
                await EmailSubmissionsRepository.getInstance().saveAttachmentClassification(
                    data.emailSubmissionId, data.attachmentOrder, data.inheritedClassification
                );
            }

            let documentContent: string = '';
            let extractionSource: string = 'azure_document_intelligence';
            let documentPages: string[] = [];

            {   // always download + OCR — child jobs use their own split PDF blob

                //* Step 1: Download the file buffer from Azure Blob Storage
                const buffer = await AzureBlobStorage.getInstance().downloadBlob(data.attachmentUrl);
                //* Step 2: Reconstruct a Multer-compatible file object for the existing pipeline
                const fakeFile = {
                    buffer,
                    originalname: data.attachmentFilename,
                    mimetype: data.attachmentMimeType,
                    size: data.attachmentSize,
                    fieldname: 'file',
                    encoding: '7bit',
                } as Express.Multer.File;

                //* Step 3: Analyze attachment and determine processing method
                const analysisResult = await AttachmentAnalyzer.getInstance().analyzeAttachment(fakeFile);
                console.log(`   📋 Decision: ${analysisResult.method}`);
                console.log(`   💡 Reason: ${analysisResult.reason}`);

                //* Step 4: Extract content based on determined method
                if (analysisResult.method === ProcessingMethod.DIRECT_TEXT_EXTRACTION) {
                    documentContent = analysisResult.extractedText || '';
                    documentPages = analysisResult.pages || [];
                    extractionSource = 'direct_text';
                    console.log(`   ✅ Text extracted directly (${documentContent.length} chars | ${documentPages.length} pages)`);
                } else {
                    console.log('   🔄 Processing with Azure Document Intelligence...');
                    const docResult = await AzureDocumentIntelligenceService.getInstance().analyzeDocument(buffer);
                    documentContent = docResult.content;
                    let diPages = docResult.pages;

                    //* Hybrid PDF merge: Azure DI may not return entries for text-based pages it skipped.
                    //* Merge DI pages with pdf-parse fallback pages — DI wins for scanned pages,
                    //* pdf-parse text wins for pages DI missed (index out of bounds in diPages).
                    //* Coherence guard: only recover a fallback page if its text passes the same
                    //* structural coherence check used for full-document routing. This prevents
                    //* garbled column-strips (e.g. the rightmost columns of a multi-column table
                    //* read independently by pdf-parse) from being merged in as real pages and
                    //* then causing the segmenter to split a single document into multiple jobs.
                    if (analysisResult.fallbackPages && analysisResult.fallbackPages.length > 0) {
                        const fallback = analysisResult.fallbackPages;
                        const totalPages = Math.max(diPages.length, fallback.length);
                        const mergedPages = Array.from({ length: totalPages }, (_, i) => {
                            const diPage = diPages[i] ?? '';
                            const pdfPage = fallback[i] ?? '';
                            if (diPage.trim().length > 0) return diPage;
                            const fallbackCoherent = pdfPage.trim().length > 0 && AttachmentAnalyzer.getInstance().isPageCoherent(pdfPage);
                            return fallbackCoherent ? pdfPage : '';
                        });
                        const recovered = mergedPages.filter((p, i) => (diPages[i] ?? '').trim().length === 0 && p.trim().length > 0).length;
                        const discarded = fallback.length - diPages.length > 0
                            ? fallback.slice(diPages.length).filter(p => p.trim().length > 0 && !AttachmentAnalyzer.getInstance().isPageCoherent(p)).length
                            : 0;
                        console.log(`   🔀 Hybrid merge: ${diPages.length} DI pages + ${fallback.length} fallback pages → ${mergedPages.filter(p => p.trim().length > 0).length} usable (${recovered} recovered, ${discarded} incoherent fallbacks discarded)`);
                        documentPages = mergedPages;
                        //* Rebuild merged content from non-empty pages only
                        documentContent = mergedPages.filter(p => p.trim().length > 0).join('\n\n');
                    } else {
                        documentPages = diPages;
                    }

                    extractionSource = 'azure_document_intelligence';
                    console.log('   ✅ Document extracted via OCR');
                    console.log(`   📊 OCR Confidence: ${docResult.averageConfidence.toFixed(4)} | Words: ${docResult.wordCount} | Pages: ${documentPages.length}`);
                }
            }

            //* Document Sanitizer: Normalize extracted content before any further processing
            documentContent = this.sanitizeExtractedContent(documentContent);

            //* Step 5: Validate extracted content
            if (!documentContent || documentContent.trim().length === 0) {
                console.log('   ⚠️  No content extracted from document');
                await EmailSubmissionsRepository.getInstance().updateAttachmentAnalysisReport(
                    data.emailSubmissionId, data.attachmentOrder, null, StatusTypes.FAILED
                );
                void AuditLogger.write({
                    submissionId: data.emailSubmissionId,
                    attachmentOrder: data.attachmentOrder,
                    tenantId: data.tenantId,
                    reviewQueue: data.reviewQueue,
                    event: AuditEventTypes.EXTRACTION_FAILED,
                    metadata: { reason: 'No content extracted from document' },
                });
                return;
            }

            // ── Audit: content extracted ───────────────────────────────────────────
            void AuditLogger.write({
                submissionId: data.emailSubmissionId,
                attachmentOrder: data.attachmentOrder,
                tenantId: data.tenantId,
                reviewQueue: data.reviewQueue,
                event: AuditEventTypes.CONTENT_EXTRACTED,
                metadata: {
                    extractedLength: documentContent.length,
                    source: extractionSource,
                },
            });

            //* Step 6: Run Document Classifier
            //* Skipped for:
            //*   - Child jobs (preExtractedContent set) — already classified at parent level
            //*   - Auto-corrected requeues (autoCorrectRequeue set) — already classified + stored
            let classificationResult: IClassificationResult | undefined;
            let classifierTokenUsage: ReturnType<TokenUsageHandler['getTokenUsage']> | undefined;

            if (!data.isChildSubmission && !data.autoCorrectRequeue) {
                console.log('   🏷️  Running Document Classifier Agent...');
                const classifierModelName = LLMClientFactory.getLLMClient().getDeploymentName();
                const classifierTokenHandler = new TokenUsageHandler(classifierModelName);
                const classifierChain = DocumentClassifierChain.classifierChain();
                const classifierOutput = await classifierChain.invoke(
                    { documentContent },
                    { callbacks: [classifierTokenHandler] },
                );
                classifierTokenUsage = classifierTokenHandler.getTokenUsage();

                const isUnclassified = data.reviewQueue === ReviewQueues.UNCLASSIFIED;

                // When the submission arrived on a single shared email (no queue hint),
                // the classifier result becomes the authoritative queue assignment.
                if (isUnclassified) {
                    if (classifierOutput.documentType === DocumentTypes.UNKNOWN || classifierOutput.confidence < 0.5) {
                        console.log('   ⚠️  Document unclassifiable or confidence too low — flagging for human review\n');
                        await EmailSubmissionsRepository.getInstance().updateAttachmentAnalysisReport(
                            data.emailSubmissionId, data.attachmentOrder, null, StatusTypes.FAILED, true
                        );
                        void AuditLogger.write({
                            submissionId: data.emailSubmissionId,
                            attachmentOrder: data.attachmentOrder,
                            tenantId: data.tenantId,
                            reviewQueue: data.reviewQueue,
                            event: AuditEventTypes.DOCUMENT_UNCLASSIFIABLE,
                            metadata: { documentType: classifierOutput.documentType, confidence: classifierOutput.confidence },
                        });
                        void AuditLogger.write({
                            submissionId: data.emailSubmissionId,
                            attachmentOrder: data.attachmentOrder,
                            tenantId: data.tenantId,
                            reviewQueue: data.reviewQueue,
                            event: AuditEventTypes.FLAGGED_FOR_HUMAN_REVIEW,
                            metadata: { reason: 'Document unclassifiable or confidence below threshold' },
                        });
                        return;
                    }

                    const assignedQueue = this.mapSuggestedQueueToReviewQueue(classifierOutput.suggestedQueue);
                    if (!assignedQueue) {
                        console.log(`   ❌ Classifier returned unrecognised suggestedQueue '${classifierOutput.suggestedQueue}' — flagging for human review\n`);
                        await EmailSubmissionsRepository.getInstance().updateAttachmentAnalysisReport(
                            data.emailSubmissionId, data.attachmentOrder, null, StatusTypes.FAILED, true
                        );
                        void AuditLogger.write({
                            submissionId: data.emailSubmissionId,
                            attachmentOrder: data.attachmentOrder,
                            tenantId: data.tenantId,
                            reviewQueue: data.reviewQueue,
                            event: AuditEventTypes.FLAGGED_FOR_HUMAN_REVIEW,
                            metadata: { reason: `Unrecognised suggestedQueue: ${classifierOutput.suggestedQueue}` },
                        });
                        return;
                    }

                    // Check if the classified queue belongs to a workflow the company has enabled.
                    const connectedWorkflows = data.connectedWorkflows ?? [];
                    if (connectedWorkflows.length > 0 && !connectedWorkflows.includes(assignedQueue)) {
                        console.log(`   🚫 Document classified as '${assignedQueue}' but this workflow is not enabled for tenant ${data.tenantId} — saving as unsupported`);
                        await EmailSubmissionsRepository.getInstance().updateAttachmentAnalysisReport(
                            data.emailSubmissionId, data.attachmentOrder, null, StatusTypes.UNSUPPORTED_WORKFLOW, false
                        );
                        void AuditLogger.write({
                            submissionId: data.emailSubmissionId,
                            attachmentOrder: data.attachmentOrder,
                            tenantId: data.tenantId,
                            reviewQueue: assignedQueue,
                            event: AuditEventTypes.DOCUMENT_CLASSIFIED,
                            metadata: {
                                documentType: classifierOutput.documentType,
                                confidence: classifierOutput.confidence,
                                assignedQueue,
                                reason: `Workflow '${assignedQueue}' is not enabled for this company`,
                            },
                        });
                        return;
                    }

                    console.log(`   ✅ Queue assigned by classifier: '${assignedQueue}'`);
                    await EmailSubmissionsRepository.getInstance().updateReviewQueue(data.emailSubmissionId, assignedQueue);

                    // Post-classification grouping: if another submission from the same
                    // email (threadId) has already been classified into the same queue,
                    // get-or-create a queue-scoped batch parent and link both.
                    // Different document types in the same email remain separate.
                    if (data.threadId) {
                        const siblings = await EmailSubmissionsRepository.getInstance().findUnlinkedSiblings(
                            data.threadId, data.tenantId, assignedQueue, data.emailSubmissionId
                        );
                        if (siblings.length > 0) {
                            const parentId = await EmailSubmissionsService.createQueueGroupParent({
                                reviewQueue: assignedQueue,
                                senderEmail: data.senderEmail,
                                recipientEmail: data.recipientEmail,
                                inboundEmailSubject: data.inboundEmailSubject,
                                inboundEmailBody: data.inboundEmailBody,
                                tenantId: data.tenantId,
                                threadId: data.threadId,
                            });
                            // Link current submission as child
                            await EmailSubmissionsRepository.getInstance().linkSubmissionToParent(
                                data.emailSubmissionId, parentId, 1
                            );
                            // Link all unlinked siblings that were waiting
                            for (let i = 0; i < siblings.length; i++) {
                                await EmailSubmissionsRepository.getInstance().linkSubmissionToParent(
                                    siblings[i]._id.toString(), parentId, i + 2
                                );
                            }
                            // Update parent split count
                            await EmailSubmissionsRepository.getInstance().updateBatchParentSplitCount(parentId);
                            console.log(`   📎 Grouped ${siblings.length + 1} '${assignedQueue}' submissions under parent ${parentId}`);
                        }
                    }

                    classificationResult = {
                        documentType: classifierOutput.documentType,
                        confidence: classifierOutput.confidence,
                        misrouted: false,
                        suggestedQueue: classifierOutput.suggestedQueue,
                    };
                    await EmailSubmissionsRepository.getInstance().saveAttachmentClassification(
                        data.emailSubmissionId, data.attachmentOrder, classificationResult
                    );
                    void AuditLogger.write({
                        submissionId: data.emailSubmissionId,
                        attachmentOrder: data.attachmentOrder,
                        tenantId: data.tenantId,
                        reviewQueue: assignedQueue,
                        event: AuditEventTypes.DOCUMENT_CLASSIFIED,
                        metadata: { documentType: classifierOutput.documentType, confidence: classifierOutput.confidence, assignedQueue },
                    });
                    // Re-enqueue with the resolved queue so the extraction agents receive the correct context.
                    this.enqueueDocumentProcessingJob({
                        ...data,
                        reviewQueue: assignedQueue,
                        autoCorrectRequeue: true,
                        inheritedClassification: undefined,
                    });
                    return;
                }

                classificationResult = {
                    documentType: classifierOutput.documentType,
                    confidence: classifierOutput.confidence,
                    misrouted: false,
                    suggestedQueue: classifierOutput.suggestedQueue,
                };

                console.log(`   🏷️  Type: ${classifierOutput.documentType} | Confidence: ${classifierOutput.confidence}`);

                await EmailSubmissionsRepository.getInstance().saveAttachmentClassification(
                    data.emailSubmissionId, data.attachmentOrder, classificationResult
                );

                void AuditLogger.write({
                    submissionId: data.emailSubmissionId,
                    attachmentOrder: data.attachmentOrder,
                    tenantId: data.tenantId,
                    reviewQueue: data.reviewQueue,
                    event: AuditEventTypes.DOCUMENT_CLASSIFIED,
                    metadata: {
                        documentType: classifierOutput.documentType,
                        confidence: classifierOutput.confidence,
                    },
                });

                if (classifierOutput.documentType === DocumentTypes.UNKNOWN || classifierOutput.confidence < 0.5) {
                    console.log('   ⚠️  Document unclassifiable or confidence too low — flagging for human review\n');
                    await EmailSubmissionsRepository.getInstance().updateAttachmentAnalysisReport(
                        data.emailSubmissionId, data.attachmentOrder, null, StatusTypes.FAILED, true
                    );
                    void AuditLogger.write({
                        submissionId: data.emailSubmissionId,
                        attachmentOrder: data.attachmentOrder,
                        tenantId: data.tenantId,
                        reviewQueue: data.reviewQueue,
                        event: AuditEventTypes.DOCUMENT_UNCLASSIFIABLE,
                        metadata: { documentType: classifierOutput.documentType, confidence: classifierOutput.confidence },
                    });
                    void AuditLogger.write({
                        submissionId: data.emailSubmissionId,
                        attachmentOrder: data.attachmentOrder,
                        tenantId: data.tenantId,
                        reviewQueue: data.reviewQueue,
                        event: AuditEventTypes.FLAGGED_FOR_HUMAN_REVIEW,
                        metadata: { reason: 'Document unclassifiable or confidence below threshold' },
                    });
                    return;
                }

                console.log(`   ✅ Document classified as '${classifierOutput.documentType}'`);
            }

            //* Step 7: Page-based document segmentation (only for primary jobs, not child jobs)
            if (!data.isChildSubmission) {
                console.log(`   🔍 Running LLM Page-Boundary Segmenter (${documentPages.length} pages)...`);

                //* Diagnostic: log each page's content preview and char count
                documentPages.forEach((page, idx) => {
                    const preview = page.replace(/\n/g, ' ').substring(0, 120);
                    console.log(`   📄 Page ${idx + 1} (${page.length} chars): ${preview}${page.length > 120 ? '...' : ''}`);
                });

                const segments = await DocumentSegmenterChain.segmentPages(documentPages);
                const isSingleDocument = segments.length <= 1;
                console.log(`   📂 Segmenter result — isSingleDocument: ${isSingleDocument} | Segments: ${segments.length}`);
                segments.forEach((seg, idx) => {
                    const preview = seg.text.replace(/\n/g, ' ').substring(0, 100);
                    console.log(`   📦 Segment ${idx + 1} (${seg.text.length} chars, pages [${seg.pageIndices.map(i => i + 1).join(', ')}]): ${preview}${seg.text.length > 100 ? '...' : ''}`);
                });

                if (!isSingleDocument && segments.length > 1) {
                    // ── Batch document detected: spawn child submissions + jobs ────────
                    console.log(`   📦 Batch document — spawning ${segments.length} child submissions`);

                    //* When this file-level submission already belongs to an email-batch parent
                    //* (i.e. the email had multiple attachments), promote segment-children directly
                    //* under that batch parent and delete the now-redundant intermediate file record.
                    //* This keeps the hierarchy flat: batch parent → segment-children, with no
                    //* invisible file-level node polluting the frontend batch view.
                    //*
                    //* When there is no email-batch parent (single-file email whose one PDF
                    //* contains multiple documents), keep the file record as the parent.
                    const promotingToBatchParent = !!data.parentSubmissionId;
                    const segmentParentId = data.parentSubmissionId ?? data.emailSubmissionId;

                    //* For PDFs, download the buffer once so we can split pages per segment.
                    //* Non-PDFs (images, DOCX) are always single-document, so this path is PDF-only.
                    const isPdf = data.attachmentMimeType === 'application/pdf';
                    let originalBuffer: Buffer | null = null;
                    if (isPdf) {
                        try {
                            originalBuffer = await AzureBlobStorage.getInstance().downloadBlob(data.attachmentUrl);
                        } catch (e: any) {
                            console.warn(`   ⚠️  Could not download buffer for PDF splitting: ${e.message}`);
                        }
                    }

                    if (promotingToBatchParent) {
                        //* Remove the intermediate file-level submission — it must not appear
                        //* as a standalone child in the batch view on the frontend.
                        await EmailSubmissionsRepository.getInstance().deleteSubmission(data.emailSubmissionId);
                        console.log(`   🗑️  Intermediate file submission ${data.emailSubmissionId} deleted — segment-children promoted to batch parent ${segmentParentId}`);
                    } else {
                        await EmailSubmissionsRepository.getInstance().markAttachmentAsSplitProcessed(
                            data.emailSubmissionId,
                            data.attachmentOrder,
                            segments.length
                        );
                    }

                    //* When promoting to a batch parent that already has other file-children,
                    //* offset the splitIndex so segment-children get globally unique positions
                    //* within the batch (e.g. files 1 and 3 already exist → segments start at 4).
                    const splitIndexOffset = promotingToBatchParent
                        ? await EmailSubmissionsRepository.getInstance().countChildrenOfParent(segmentParentId)
                        : 0;

                    void AuditLogger.write({
                        submissionId: segmentParentId,
                        attachmentOrder: data.attachmentOrder,
                        tenantId: data.tenantId,
                        reviewQueue: data.reviewQueue,
                        event: AuditEventTypes.DOCUMENT_SEGMENTED,
                        metadata: { segmentCount: segments.length, segmentParentId, promotingToBatchParent },
                    });

                    for (let i = 0; i < segments.length; i++) {
                        const segment = segments[i];

                        //* Attempt to produce a child PDF containing only this segment's pages.
                        //* Falls back gracefully to the parent URL if extraction fails.
                        let childBlobUrl = data.attachmentUrl;
                        let childFilename = `${data.attachmentFilename}_segment_${i + 1}`;

                        if (isPdf && originalBuffer) {
                            const splitBuffer = await PdfSplitter.extractPages(originalBuffer, segment.pageIndices);
                            if (splitBuffer) {
                                try {
                                    const { Readable } = await import('stream');
                                    const stream = Readable.from(splitBuffer);
                                    const splitFilename = `${data.attachmentFilename.replace(/\.pdf$/i, '')}-part-${i + 1}.pdf`;
                                    childBlobUrl = await AzureBlobStorage.getInstance().uploadDocument(stream, splitFilename, BlobContentDisposition.INLINE, data.tenantId);
                                    childFilename = splitFilename;
                                    console.log(`   ✂️  Segment ${i + 1}: split PDF uploaded → ${childBlobUrl}`);
                                } catch (uploadErr: any) {
                                    console.warn(`   ⚠️  Segment ${i + 1}: split PDF upload failed (${uploadErr.message}) — using parent URL`);
                                }
                            } else {
                                console.warn(`   ⚠️  Segment ${i + 1}: PDF extraction returned null — using parent URL`);
                            }
                        }

                        //* Per-segment classification: run the classifier on each segment's
                        //* text so that mixed-type documents (e.g. invoice + daily log + COI
                        //* in one PDF) are routed to the correct queue rather than inheriting
                        //* the parent's queue blindly.
                        let segmentQueue: string = data.reviewQueue;
                        let segmentClassification: IClassificationResult = classificationResult!;
                        try {
                            console.log(`   🏷️  Classifying segment ${i + 1}/${segments.length}...`);
                            const segClassifierModelName = LLMClientFactory.getLLMClient().getDeploymentName();
                            const segTokenHandler = new TokenUsageHandler(segClassifierModelName);
                            const segClassifierChain = DocumentClassifierChain.classifierChain();
                            const segClassifierOutput = await segClassifierChain.invoke(
                                { documentContent: segment.text },
                                { callbacks: [segTokenHandler] },
                            );

                            const segmentIsClassifiable =
                                segClassifierOutput.documentType !== DocumentTypes.UNKNOWN &&
                                segClassifierOutput.confidence >= 0.5;

                            if (segmentIsClassifiable) {
                                const mappedQueue = this.mapSuggestedQueueToReviewQueue(segClassifierOutput.suggestedQueue);
                                if (mappedQueue) segmentQueue = mappedQueue;
                            }

                            segmentClassification = {
                                documentType: segClassifierOutput.documentType,
                                confidence: segClassifierOutput.confidence,
                                misrouted: false,
                                suggestedQueue: segClassifierOutput.suggestedQueue,
                            };

                            console.log(`   🏷️  Segment ${i + 1} → type: ${segClassifierOutput.documentType} | confidence: ${segClassifierOutput.confidence} | queue: ${segmentQueue}`);
                        } catch (segClassErr: any) {
                            console.warn(`   ⚠️  Segment ${i + 1}: per-segment classification failed (${segClassErr.message}) — falling back to parent queue`);
                        }

                        const childAttachment = {
                            filename: childFilename,
                            mimeType: data.attachmentMimeType,
                            size: segment.text.length,
                            order: 1,
                            url: childBlobUrl,
                            aiAnalysisStatus: StatusTypes.IN_PROGRESS,
                        };

                        const childSplitIndex = splitIndexOffset + i + 1;

                        const childSubmissionId = await EmailSubmissionsRepository.getInstance().insertChildSubmission({
                            parentSubmissionId: segmentParentId,
                            splitIndex: childSplitIndex,
                            reviewQueue: segmentQueue,
                            senderEmail: data.senderEmail,
                            recipientEmail: data.recipientEmail,
                            inboundEmailSubject: data.inboundEmailSubject,
                            inboundEmailBody: data.inboundEmailBody,
                            tenantId: data.tenantId,
                            threadId: data.threadId,
                            attachment: childAttachment,
                        });

                        this.enqueueDocumentProcessingJob({
                            emailSubmissionId: childSubmissionId,
                            attachmentUrl: childBlobUrl,
                            attachmentFilename: childFilename,
                            attachmentMimeType: data.attachmentMimeType,
                            attachmentSize: segment.text.length,
                            attachmentOrder: 1,
                            reviewQueue: segmentQueue,
                            tenantId: data.tenantId,
                            senderEmail: data.senderEmail,
                            recipientEmail: data.recipientEmail,
                            inboundEmailSubject: data.inboundEmailSubject,
                            inboundEmailBody: data.inboundEmailBody,
                            threadId: data.threadId,
                            //* Child jobs re-OCR their own split PDF blob for clean, complete content.
                            //* isChildSubmission skips re-classification and re-segmentation only.
                            isChildSubmission: true,
                            //* Pass the segment-specific classification result so the child
                            //* submission stores it without re-running the classifier.
                            inheritedClassification: segmentClassification,
                        });

                        void AuditLogger.write({
                            submissionId: segmentParentId,
                            attachmentOrder: data.attachmentOrder,
                            tenantId: data.tenantId,
                            reviewQueue: data.reviewQueue,
                            event: AuditEventTypes.CHILD_JOB_ENQUEUED,
                            metadata: {
                                childSubmissionId,
                                splitIndex: childSplitIndex,
                                segmentLength: segment.text.length,
                                pageIndices: segment.pageIndices,
                                childBlobUrl,
                            },
                        });

                        console.log(`   ✅ Child submission ${i + 1}/${segments.length} created: ${childSubmissionId} (splitIndex: ${childSplitIndex})`);
                    }

                    //* After all segment-children are inserted, sync the batch parent's
                    //* splitDocumentCount to reflect the final true child count.
                    if (promotingToBatchParent) {
                        await EmailSubmissionsRepository.getInstance().updateBatchParentSplitCount(segmentParentId);
                    }

                    console.log(`   🏁 Batch dispatch complete — ${segments.length} child jobs enqueued\n`);
                    return;
                }

                console.log('   ✅ Single document confirmed — proceeding to AI analysis');
            }

            console.log('   🤖 Running AI analysis (Reflect & Correct multi-agent graph)...');
            console.log(`   📝 Document content being sent to LLM (${documentContent.length} chars):`);
            console.log('   ---');
            console.log(documentContent.substring(0, 800) + (documentContent.length > 800 ? `\n   ... [${documentContent.length - 800} more chars]` : ''));
            console.log('   ---');

            void AuditLogger.write({
                submissionId: data.emailSubmissionId,
                attachmentOrder: data.attachmentOrder,
                tenantId: data.tenantId,
                reviewQueue: data.reviewQueue,
                event: AuditEventTypes.EXTRACTION_STARTED,
                metadata: { reviewQueue: data.reviewQueue },
            });

            //* Step 8: Run the 3-layer QA agent pipeline (Layer 1 validator + LangGraph + scorer)
            let graphResult: Awaited<ReturnType<typeof InvoicesAgent.run>> | null = null;
            let enrichmentTokens = { inputTokens: 0, outputTokens: 0 };

            if (data.reviewQueue === ReviewQueues.INVOICES) {
                graphResult = await InvoicesAgent.run(documentContent);
                const costCodeTokens = await this.enrichInvoiceLineItemsWithCostCodes(graphResult.extractedData, data.tenantId);
                const jobTokens = await this.enrichWithJobAttribution(data.emailSubmissionId, data.attachmentOrder, graphResult.extractedData, data.tenantId);
                enrichmentTokens.inputTokens += (costCodeTokens?.inputTokens ?? 0) + (jobTokens?.inputTokens ?? 0);
                enrichmentTokens.outputTokens += (costCodeTokens?.outputTokens ?? 0) + (jobTokens?.outputTokens ?? 0);
            } else if (data.reviewQueue === ReviewQueues.DAILY_LOGS) {
                graphResult = await DailyLogsAgent.run(documentContent);
                const wcCodeTokens = await this.enrichDailyLogTasksWithWCCodes(graphResult.extractedData, data.tenantId);
                const jobTokens = await this.enrichWithJobAttribution(data.emailSubmissionId, data.attachmentOrder, graphResult.extractedData, data.tenantId);
                enrichmentTokens.inputTokens += (wcCodeTokens?.inputTokens ?? 0) + (jobTokens?.inputTokens ?? 0);
                enrichmentTokens.outputTokens += (wcCodeTokens?.outputTokens ?? 0) + (jobTokens?.outputTokens ?? 0);
            } else if (data.reviewQueue === ReviewQueues.COMPLIANCE_ALERT) {
                graphResult = await ComplianceAlertsAgent.run(documentContent);
            }

            if (graphResult) {
                console.log('   ✅ AI analysis complete');
                console.log(`   🎯 QA Confidence: ${graphResult.confidenceScore} | Iterations: ${graphResult.iterationCount} | Routing: ${graphResult.routingDecision}`);
                console.log(`   🪙 Tokens — Input: ${graphResult.tokenConsumptionReceipt.inputTokens} | Output: ${graphResult.tokenConsumptionReceipt.outputTokens} | Total: ${graphResult.tokenConsumptionReceipt.totalUsage}`);
                if (graphResult.tokenConsumptionReceipt.extraction && graphResult.tokenConsumptionReceipt.qa) {
                    if (classifierTokenUsage) {
                        console.log(`      ↳ Classifier   — In: ${classifierTokenUsage.inputTokens} | Out: ${classifierTokenUsage.outputTokens} | Model: ${classifierTokenUsage.model}`);
                    }
                    console.log(`      ↳ Extraction  — In: ${graphResult.tokenConsumptionReceipt.extraction.inputTokens} | Out: ${graphResult.tokenConsumptionReceipt.extraction.outputTokens} | Model: ${graphResult.tokenConsumptionReceipt.extraction.model}`);
                    console.log(`      ↳ QA          — In: ${graphResult.tokenConsumptionReceipt.qa.inputTokens} | Out: ${graphResult.tokenConsumptionReceipt.qa.outputTokens} | Model: ${graphResult.tokenConsumptionReceipt.qa.model}`);
                }
                if (graphResult.validationIssues.length > 0) {
                    const criticals = graphResult.validationIssues.filter(i => i.severity === 'critical');
                    const warnings = graphResult.validationIssues.filter(i => i.severity === 'warning');
                    if (criticals.length > 0) console.log(`   🚨 Validation criticals (${criticals.length}): ${criticals.map(i => i.field).join(', ')}`);
                    if (warnings.length > 0) console.log(`   ⚠️  Validation warnings  (${warnings.length}): ${warnings.map(i => i.field).join(', ')}`);
                }
                if (graphResult.flaggedForHumanReview) {
                    console.log('   ⚠️  Flagged for human review — max iterations reached without QA approval\n');
                }
                if (graphResult.qaCritique && graphResult.qaCritique.length > 0) {
                    console.log('   🔍 Final QA critique (reasons for last iteration):');
                    graphResult.qaCritique.forEach((reason, i) => {
                        console.log(`      ${i + 1}. ${reason}`);
                    });
                }

                //* Map routing decision to storage status
                //*   auto_approve → COMPLETED   (high confidence, no review needed)
                //*   soft_flag    → COMPLETED   (data usable, review recommended — non-blocking)
                //*   human_review → NEEDS_REVIEW (full review required before use)
                //*   requeue      → NEEDS_REVIEW (recoverable, treated as review until re-enqueue support added)
                //*   dead_letter  → FAILED       (unrecoverable, score too low)
                const routingToStatus: Record<RoutingDecision, StatusTypes> = {
                    [RoutingDecision.AUTO_APPROVE]: StatusTypes.COMPLETED,
                    [RoutingDecision.SOFT_FLAG]: StatusTypes.COMPLETED,
                    [RoutingDecision.HUMAN_REVIEW]: StatusTypes.NEEDS_REVIEW,
                    [RoutingDecision.REQUEUE]: StatusTypes.NEEDS_REVIEW,
                    [RoutingDecision.DEAD_LETTER]: StatusTypes.FAILED,
                };
                let storageStatus = routingToStatus[graphResult.routingDecision] ?? StatusTypes.NEEDS_REVIEW;

                //* For compliance alerts, compute expiration-derived status separately.
                //* The attachment aiAnalysisStatus carries: compliant / expiring_soon / expired / failed
                //* The outer submission aiAnalysisStatus rolls up using: completed / needs_review / failed only
                //* so the outer status stays consistent with other queues.
                let complianceStatusResult: ReturnType<typeof computeComplianceStatus> | null = null;
                let attachmentStatus = storageStatus;
                if (data.reviewQueue === ReviewQueues.COMPLIANCE_ALERT && storageStatus !== StatusTypes.FAILED) {
                    complianceStatusResult = computeComplianceStatus(graphResult.extractedData?.expirationDate);
                    attachmentStatus = complianceStatusResult.emailStatus;
                }

                //* Merge classifier token usage (from Step 6) into the graph receipt.
                //* classifierTokenUsage is undefined for child jobs and auto-corrected requeues
                //* (they skip classification), so the merge is a no-op in those cases.
                const enrichmentTotal = enrichmentTokens.inputTokens + enrichmentTokens.outputTokens;
                const mergedReceipt = {
                    inputTokens: graphResult.tokenConsumptionReceipt.inputTokens + (classifierTokenUsage?.inputTokens ?? 0) + enrichmentTokens.inputTokens,
                    outputTokens: graphResult.tokenConsumptionReceipt.outputTokens + (classifierTokenUsage?.outputTokens ?? 0) + enrichmentTokens.outputTokens,
                    totalUsage: graphResult.tokenConsumptionReceipt.totalUsage + (classifierTokenUsage ? classifierTokenUsage.inputTokens + classifierTokenUsage.outputTokens : 0) + enrichmentTotal,
                    ...(classifierTokenUsage && { classifier: classifierTokenUsage }),
                    extraction: graphResult.tokenConsumptionReceipt.extraction,
                    qa: graphResult.tokenConsumptionReceipt.qa,
                    ...(enrichmentTotal > 0 && { enrichment: { inputTokens: enrichmentTokens.inputTokens, outputTokens: enrichmentTokens.outputTokens } }),
                };

                const resolvedComplianceStatus = complianceStatusResult
                    ?? (data.reviewQueue === ReviewQueues.COMPLIANCE_ALERT
                        ? computeComplianceStatus(graphResult.extractedData?.expirationDate)
                        : null);

                const aiAnalysisReport = graphResult.extractedData
                    ? {
                        ...graphResult.extractedData,
                        ...(data.reviewQueue === ReviewQueues.COMPLIANCE_ALERT && resolvedComplianceStatus && {
                            isExpired: resolvedComplianceStatus.isExpired,
                            isExpiringSoon: resolvedComplianceStatus.isExpiringSoon,
                            isCompliant: resolvedComplianceStatus.isCompliant,
                        }),
                        qaConfidence: graphResult.confidenceScore,
                        qaReasoning: graphResult.qaReasoning,
                        routingDecision: graphResult.routingDecision,
                        scoreBreakdown: graphResult.scoreBreakdown,
                    }
                    : null;

                await EmailSubmissionsRepository.getInstance().updateAttachmentAnalysisReport(
                    data.emailSubmissionId,
                    data.attachmentOrder,
                    aiAnalysisReport,
                    attachmentStatus,
                    graphResult.flaggedForHumanReview,
                    mergedReceipt
                );

                void AuditLogger.write({
                    submissionId: data.emailSubmissionId,
                    attachmentOrder: data.attachmentOrder,
                    tenantId: data.tenantId,
                    reviewQueue: data.reviewQueue,
                    event: AuditEventTypes.TOKEN_USAGE_RECORDED,
                    metadata: { ...mergedReceipt },
                });

                if (graphResult.flaggedForHumanReview) {
                    void AuditLogger.write({
                        submissionId: data.emailSubmissionId,
                        attachmentOrder: data.attachmentOrder,
                        tenantId: data.tenantId,
                        reviewQueue: data.reviewQueue,
                        event: AuditEventTypes.FLAGGED_FOR_HUMAN_REVIEW,
                        metadata: {
                            reason: 'Max QA iterations reached without approval',
                            iterationCount: graphResult.iterationCount,
                            confidenceScore: graphResult.confidenceScore,
                            routingDecision: graphResult.routingDecision,
                        },
                    });
                } else {
                    void AuditLogger.write({
                        submissionId: data.emailSubmissionId,
                        attachmentOrder: data.attachmentOrder,
                        tenantId: data.tenantId,
                        reviewQueue: data.reviewQueue,
                        event: AuditEventTypes.EXTRACTION_COMPLETED,
                        metadata: {
                            confidenceScore: graphResult.confidenceScore,
                            iterationCount: graphResult.iterationCount,
                            routingDecision: graphResult.routingDecision,
                        },
                    });
                }
            } else {
                await EmailSubmissionsRepository.getInstance().updateAttachmentAnalysisReport(
                    data.emailSubmissionId, data.attachmentOrder, null, StatusTypes.FAILED, false
                );
                void AuditLogger.write({
                    submissionId: data.emailSubmissionId,
                    attachmentOrder: data.attachmentOrder,
                    tenantId: data.tenantId,
                    reviewQueue: data.reviewQueue,
                    event: AuditEventTypes.EXTRACTION_FAILED,
                    metadata: { reason: 'No graph result returned for review queue' },
                });
            }
        } catch (error) {
            console.error('   ❌ Document processing failed:', error.message);
            if (error.stack) {
                console.error('   Stack trace:', error.stack);
            }
            try {
                await EmailSubmissionsRepository.getInstance().updateAttachmentAnalysisReport(
                    data.emailSubmissionId, data.attachmentOrder, null, StatusTypes.FAILED, false
                );
                void AuditLogger.write({
                    submissionId: data.emailSubmissionId,
                    attachmentOrder: data.attachmentOrder,
                    tenantId: data.tenantId,
                    reviewQueue: data.reviewQueue,
                    event: AuditEventTypes.EXTRACTION_FAILED,
                    metadata: { reason: error.message },
                });
            } catch (dbError) {
                console.error('   ❌ Failed to mark submission as failed in DB:', dbError.message);
            }
            throw error;
        }
    }




    //* -------------------------------------------------------------------------- */
    //*                        DOCUMENT SANITIZER METHOD                          */
    //* -------------------------------------------------------------------------- */
    private sanitizeExtractedContent(content: string): string {
        return content
            .replace(/\n{3,}/g, '\n\n')   // collapse excessive blank lines (e.g. scanned blank pages)
            .replace(/[ \t]{2,}/g, ' ')    // collapse multiple spaces/tabs to a single space
            .trim();
    }



    //* -------------------------------------------------------------------------- */
    //*                    ENRICH WITH JOB ATTRIBUTION METHOD                     */
    //* -------------------------------------------------------------------------- */
    private async enrichWithJobAttribution(
        submissionId: string,
        attachmentOrder: number,
        extractedData: any,
        tenantId: string
    ): Promise<{ inputTokens: number; outputTokens: number }> {
        const searchTimeoutMs = 20000;
        const noTokens = { inputTokens: 0, outputTokens: 0 };

        const jobHint: string = (extractedData?.job || '').trim();
        if (!jobHint) return noTokens;

        try {
            const candidates = await this.withTimeout(
                AzureJobsSearch.getInstance().retrieveJobCandidates(jobHint, tenantId, 5),
                searchTimeoutMs,
                `Job attribution search timed out after ${searchTimeoutMs}ms`
            );

            if (!candidates.length) {
                await EmailSubmissionsRepository.getInstance().updateAttachmentJobId(submissionId, attachmentOrder, null);
                Logger.Console(`Job attribution: no candidates for "${jobHint}" in tenant ${tenantId}`, 'info');
                return noTokens;
            }

            const { result: mappedJobId, inputTokens, outputTokens } = await this.resolveJobMatchWithLLM(jobHint, candidates);

            await EmailSubmissionsRepository.getInstance().updateAttachmentJobId(submissionId, attachmentOrder, mappedJobId);

            if (mappedJobId) {
                const matched = candidates.find(c => c.jobId === mappedJobId);
                Logger.Console(`Job attribution matched: "${jobHint}" → ${matched?.jobName} (${matched?.jobNumber})`, 'info');
            } else {
                Logger.Console(`Job attribution: LLM found no match for "${jobHint}" among ${candidates.length} candidates`, 'info');
            }

            return { inputTokens, outputTokens };
        } catch (error: any) {
            Logger.Console(`Job attribution skipped for submission ${submissionId}: ${error?.message || error}`, 'warn');
            return noTokens;
        }
    }

    private async resolveCodeMatchWithLLM(query: string, candidates: IKnowledgeBaseVectorChunk[]): Promise<{ result: string | null; inputTokens: number; outputTokens: number }> {
        const modelName = LLMClientFactory.getLLMClient().getDeploymentName();
        const tokenHandler = new TokenUsageHandler(modelName);
        const llm = LLMClientFactory.getLLMClient().getLLMInstance(0);

        const candidateList = candidates
            .map((c, i) => `${i + 1}. Code: ${c.code} | Description: ${c.codeDescription || 'N/A'}`)
            .join('\n');

        const prompt = `You are a code matching assistant. The following item was extracted from a scanned document:

        Item: "${query}"

        Here are the candidate codes found in the system:
        ${candidateList}

        Your task: Identify which candidate best matches the item based on its description. If none is a reasonable match, return null.

        Respond with ONLY a JSON object in this exact format (no explanation, no markdown):
        {"code": "<the matched code number>"} or {"code": null}`;

        const response = await llm.invoke([new HumanMessage(prompt)], { callbacks: [tokenHandler] });
        const usage = tokenHandler.getTokenUsage();
        const raw = (response.content as string).trim();

        try {
            const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
            const matchedCode: string | null = parsed?.code ?? null;
            if (!matchedCode) return { result: null, ...usage };

            const matched = candidates.find(c => c.code === matchedCode);
            if (!matched) return { result: null, ...usage };

            const result = matched.codeDescription
                ? `${matched.code} - ${matched.codeDescription}`
                : matched.code!;
            return { result, ...usage };
        } catch {
            Logger.Console(`Code match LLM response parse failed: ${raw}`, 'warn');
            return { result: null, ...usage };
        }
    }

    private async resolveJobMatchWithLLM(jobHint: string, candidates: JobSearchMatch[]): Promise<{ result: string | null; inputTokens: number; outputTokens: number }> {
        const modelName = LLMClientFactory.getLLMClient().getDeploymentName();
        const tokenHandler = new TokenUsageHandler(modelName);
        const llm = LLMClientFactory.getLLMClient().getLLMInstance(0);

        const candidateList = candidates
            .map((c, i) => `${i + 1}. ID: ${c.jobId} | Name: ${c.jobName} | Number: ${c.jobNumber}`)
            .join('\n');

        const prompt = `You are a job matching assistant. A document was scanned and the following job identifier was extracted:

        Extracted job hint: "${jobHint}"

        Here are the candidate jobs found in the system:
        ${candidateList}

        Your task: Identify which candidate is the correct match for the extracted job hint, based on name or number similarity. If none of the candidates is a reasonable match, return null.

        Respond with ONLY a JSON object in this exact format (no explanation, no markdown):
        {"jobId": "<the matched job ID>" } or {"jobId": null}`;

        const response = await llm.invoke([new HumanMessage(prompt)], { callbacks: [tokenHandler] });
        const usage = tokenHandler.getTokenUsage();
        const raw = (response.content as string).trim();

        try {
            const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
            const matchedId = parsed?.jobId ?? null;
            if (matchedId && candidates.some(c => c.jobId === matchedId)) return { result: matchedId, ...usage };
            return { result: null, ...usage };
        } catch {
            Logger.Console(`Job attribution LLM response parse failed: ${raw}`, 'warn');
            return { result: null, ...usage };
        }
    }



    //* -------------------------------------------------------------------------- */
    //*               ENRICH DAILY LOG TASKS WITH WC CODES METHOD                 */
    //* -------------------------------------------------------------------------- */
    private async enrichDailyLogTasksWithWCCodes(dailyLogReport: any, tenantId: string): Promise<{ inputTokens: number; outputTokens: number }> {
        const searchTimeoutMs = 20000;
        let totalInput = 0, totalOutput = 0;

        if (!dailyLogReport || !Array.isArray(dailyLogReport.tasks) || dailyLogReport.tasks.length === 0) {
            return { inputTokens: 0, outputTokens: 0 };
        }

        const availableWCCodes = await this.getAvailableWCCodes(tenantId);

        if (availableWCCodes.length === 0) {
            dailyLogReport.tasks = dailyLogReport.tasks.map((task: any) => ({ ...task, mappedCostCode: null }));
            Logger.Console(`Daily log WC-code mapping skipped: no active WC codes found for tenant ${tenantId}`, 'warn');
            return { inputTokens: 0, outputTokens: 0 };
        }

        let ownerId: string | null = null;
        try {
            ownerId = await OnboardingRepository.getInstance().getOwnerIdByTenantId(tenantId);
        } catch (error: any) {
            Logger.Console(`Daily log WC-code vector lookup skipped: owner lookup failed for tenant ${tenantId}: ${error?.message || error}`, 'warn');
        }

        for (let index = 0; index < dailyLogReport.tasks.length; index++) {
            const task = dailyLogReport.tasks[index];
            const query = (task?.taskName || '').trim();

            if (!query) {
                dailyLogReport.tasks[index] = { ...task, mappedCostCode: null };
                continue;
            }

            let mappedWCCode: string | null = null;

            try {
                if (ownerId) {
                    const candidates = await this.withTimeout(
                        AzureAISearch.getInstance().retrieveCodeCandidates(query, ownerId, tenantId, 'wc_code', 5),
                        searchTimeoutMs,
                        `Daily log WC-code mapping timed out after ${searchTimeoutMs}ms`
                    );

                    if (candidates.length > 0) {
                        const { result, inputTokens, outputTokens } = await this.resolveCodeMatchWithLLM(query, candidates);
                        mappedWCCode = result;
                        totalInput += inputTokens;
                        totalOutput += outputTokens;
                    }
                }
            } catch (error: any) {
                Logger.Console(`Daily log WC-code vector lookup skipped for task ${index + 1}: ${error?.message || error}`, 'warn');
            }

            dailyLogReport.tasks[index] = { ...task, mappedCostCode: mappedWCCode };

            if (index < dailyLogReport.tasks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        return { inputTokens: totalInput, outputTokens: totalOutput };
    }



    //* -------------------------------------------------------------------------- */
    //*                         GET AVAILABLE WC CODES METHOD                      */
    //* -------------------------------------------------------------------------- */
    private async getAvailableWCCodes(tenantId: string): Promise<IWCCode[]> {
        try {
            return await WCCodesRepository.getInstance().collection
                .find({
                    deletedAt: null,
                    isActive: true,
                    tenantId: { $in: [tenantId, 'system'] },
                })
                .project({
                    codeNumber: 1,
                    category: 1,
                    description: 1,
                    tenantId: 1,
                })
                .toArray() as unknown as IWCCode[];
        } catch (error: any) {
            Logger.Console(`Daily log WC-code DB lookup failed for tenant ${tenantId}: ${error?.message || error}`, 'warn');
            return [];
        }
    }






    //* -------------------------------------------------------------------------- */
    //*             ENRICH INVOICE LINE ITEMS WITH COST CODES METHOD              */
    //* -------------------------------------------------------------------------- */
    private async enrichInvoiceLineItemsWithCostCodes(invoiceReport: any, tenantId: string): Promise<{ inputTokens: number; outputTokens: number }> {
        const searchTimeoutMs = 20000;
        let totalInput = 0, totalOutput = 0;

        if (!invoiceReport || !Array.isArray(invoiceReport.lineItems) || invoiceReport.lineItems.length === 0) {
            return { inputTokens: 0, outputTokens: 0 };
        }

        const availableCostCodes = await this.getAvailableCostCodes(tenantId);

        if (availableCostCodes.length === 0) {
            invoiceReport.lineItems = invoiceReport.lineItems.map((lineItem: any) => ({ ...lineItem, mappedCostCode: null }));
            Logger.Console(`Invoice cost-code mapping skipped: no active cost codes found for tenant ${tenantId}`, 'warn');
            return { inputTokens: 0, outputTokens: 0 };
        }

        let ownerId: string | null = null;
        try {
            ownerId = await OnboardingRepository.getInstance().getOwnerIdByTenantId(tenantId);
        } catch (error: any) {
            Logger.Console(`Invoice cost-code vector lookup skipped: owner lookup failed for tenant ${tenantId}: ${error?.message || error}`, 'warn');
        }

        for (let index = 0; index < invoiceReport.lineItems.length; index++) {
            const lineItem = invoiceReport.lineItems[index];
            const query = (lineItem?.itemName || '').trim();

            if (!query) {
                invoiceReport.lineItems[index] = { ...lineItem, mappedCostCode: null };
                continue;
            }

            let mappedCostCode: string | null = null;

            try {
                if (ownerId) {
                    const candidates = await this.withTimeout(
                        AzureAISearch.getInstance().retrieveCodeCandidates(query, ownerId, tenantId, 'cost_code', 5),
                        searchTimeoutMs,
                        `Invoice cost-code mapping timed out after ${searchTimeoutMs}ms`
                    );

                    if (candidates.length > 0) {
                        const { result, inputTokens, outputTokens } = await this.resolveCodeMatchWithLLM(query, candidates);
                        mappedCostCode = result;
                        totalInput += inputTokens;
                        totalOutput += outputTokens;
                    }
                }
            } catch (error: any) {
                Logger.Console(`Invoice cost-code vector lookup skipped for line item ${index + 1}: ${error?.message || error}`, 'warn');
            }

            invoiceReport.lineItems[index] = { ...lineItem, mappedCostCode };

            if (index < invoiceReport.lineItems.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        return { inputTokens: totalInput, outputTokens: totalOutput };
    }



    //* -------------------------------------------------------------------------- */
    //*                      GET AVAILABLE COST CODES METHOD                       */
    //* -------------------------------------------------------------------------- */
    private async getAvailableCostCodes(tenantId: string): Promise<ICostCode[]> {
        try {
            return await CostCodesRepository.getInstance().collection
                .find({
                    deletedAt: null,
                    isActive: true,
                    tenantId: { $in: [tenantId, 'system'] },
                })
                .project({
                    codeNumber: 1,
                    category: 1,
                    description: 1,
                    tenantId: 1,
                })
                .toArray() as unknown as ICostCode[];
        } catch (error: any) {
            Logger.Console(`Invoice cost-code DB lookup failed for tenant ${tenantId}: ${error?.message || error}`, 'warn');
            return [];
        }
    }






    //* -------------------------------------------------------------------------- */
    //*                            WITH TIMEOUT METHOD                             */
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






    //* -------------------------------------------------------------------------- */
    //*               MAP SUGGESTED QUEUE TO REVIEW QUEUE HELPER                   */
    //* -------------------------------------------------------------------------- */
    //* Maps the classifier's free-text suggestedQueue string to a typed ReviewQueues value.
    //* Returns null when the string is null, empty, or does not match any known queue —
    //* the caller should fall back to a FAILED status in that case.
    private mapSuggestedQueueToReviewQueue(suggestedQueue: string | null | undefined): ReviewQueues | null {
        if (!suggestedQueue) return null;
        const normalised = suggestedQueue.trim().toLowerCase();
        switch (normalised) {
            case ReviewQueues.INVOICES: return ReviewQueues.INVOICES;
            case ReviewQueues.DAILY_LOGS: return ReviewQueues.DAILY_LOGS;
            case ReviewQueues.COMPLIANCE_ALERT: return ReviewQueues.COMPLIANCE_ALERT;
            default: return null;
        }
    }



    //* -------------------------------------------------------------------------- */
    //*                     SETUP WORKER EVENT LISTENERS METHOD                    */
    //* -------------------------------------------------------------------------- */
    public async setupWorkerEventListeners(worker: Worker, queueName: string): Promise<void> {
        worker.on('completed', async (job: Job) => {
            Logger.Console(`Job completed in queue ${queueName}: ${job.id}`, 'info');
            await job.remove();
        });

        worker.on('failed', async (job: Job, err: Error) => {
            Logger.Console(`Job failed in queue ${queueName}: ${job.id} with error: ${err.message}`, 'error');
        });

        worker.on('stalled', (job) => {
            Logger.Console(`Job stalled for queue: ${queueName}`, 'warn');
        });
    }




    //* -------------------------------------------------------------------------- */
    //*                             MONITOR LOAD METHOD                            */
    //* -------------------------------------------------------------------------- */
    private async monitorLoad() {
        setInterval(async () => {
            for (const queueName of Object.keys(this.queues)) {
                const queue = this.queues[queueName];
                const queueInfo = await queue.getJobCounts();

                //* Adjust concurrency for vertical scaling
                const totalJobs = queueInfo.waiting + queueInfo.active;

                if (totalJobs > this.workerConcurrency * 2) {
                    this.workerConcurrency += 2; //& Scale up
                } else if (this.workerConcurrency > os.cpus().length && totalJobs < this.workerConcurrency) {
                    this.workerConcurrency = Math.max(1, this.workerConcurrency - 1); //& Scale down
                }

                //* Update concurrency for all workers
                const worker = this.workers[queueName];
                if (worker) {
                    worker.opts.concurrency = this.workerConcurrency;
                }

                //* Spawn or remove workers for horizontal scaling
                const shouldSpawnWorker = totalJobs > this.workerConcurrency * 5;
                const shouldRemoveWorker = totalJobs === 0;

                if (shouldSpawnWorker) {
                    this.spawnAdditionalWorker(queueName);
                }

                if (shouldRemoveWorker) {
                    this.terminateWorker(queueName);
                }
            }
        }, 60000);
    }



    //* -------------------------------------------------------------------------- */
    //*                       SPAWN ADDITIONAL WORKER METHOD                       */
    //* -------------------------------------------------------------------------- */
    private spawnAdditionalWorker(queueName: string): void {
        const additionalWorker = new Worker(queueName, this.queueProcessors[queueName], {
            connection: { url: this.redisConfig.url },
            concurrency: this.workerConcurrency,
            lockDuration: 300_000,
        });

        additionalWorker.on("completed", (job) => {
            Logger.Console(`Additional Worker completed job ${job.id} for queue ${queueName}`, "info");
        });

        additionalWorker.on("failed", (job, err) => {
            Logger.Console(`Additional Worker failed job ${job.id} for queue ${queueName} - Error: ${err.message}`, "error");
        });

        this.workers[`${queueName}-extra`] = additionalWorker;
        Logger.Console(`Spawned additional worker for queue: ${queueName}`, "info");
    }


    //* -------------------------------------------------------------------------- */
    //*                           TERMINATE WORKER METHOD                          */
    //* -------------------------------------------------------------------------- */
    private async terminateWorker(queueName: string): Promise<void> {
        const workerKey = `${queueName}-extra`;
        if (this.workers[workerKey]) {
            await this.workers[workerKey].close();
            delete this.workers[workerKey];
            Logger.Console(`Terminated additional worker for queue: ${queueName}`, "info");
        }
    }

}



export default EmailsJobProcessor;
