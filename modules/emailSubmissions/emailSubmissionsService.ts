import IJWTPayload from '../../core/interfaces/jwt';
import QueryOperators from '../../core/enums/queryOperators';
import ReviewQueues from '../../core/enums/reviewQueues';
import { CustomError } from '../../core/errors/custom';
import { HttpStatusCode } from 'axios';
import EmailSubmissionsRepository from './emailSubmissionsRepository';
import EmailSubmissionsModel from './emailSubmissionsModel';
import { Utils } from '../../utils/utils';
import { IEmailSubmissions, ICreateEmailSubmissionDTO, ICreateBatchParentSubmissionDTO, IListEmailSubmissionsDTO, IUpdateInvoiceStatusDTO, IUpdateDailyLogStatusDTO, IUpdateComplianceAlertStatusDTO, listEmailSubmissionsResponseFields } from './emailSubmissionsInterface';
import { computeComplianceStatus } from '../../ai/utils/extractionSanitizer';
import { ObjectId } from 'mongodb';
import StatusTypes from '../../core/enums/statusTypes';
import QueryOperationTypes from '../../core/enums/queryOperationTypes';
import AuditLogger from '../../utils/helpers/auditLogger';
import AuditEventTypes from '../../core/enums/auditEventTypes';

class EmailSubmissionsService {



	//* -------------------------------------------------------------------------- */
	//*                   CREATE BATCH PARENT SUBMISSION METHOD                   */
	//* -------------------------------------------------------------------------- */
	//* Creates the top-level container record for an email that carries multiple
	//* attachments.  It holds no attachment data itself — it exists purely so
	//* all file-level (and segment-level) children can share a common parent.
	public async createBatchParentSubmission(dto: ICreateBatchParentSubmissionDTO): Promise<string> {
		const submissionData: Partial<IEmailSubmissions> = {
			reviewQueue: dto.reviewQueue,
			senderEmail: dto.senderEmail,
			recipientEmail: dto.recipientEmail,
			inboundEmailSubject: dto.inboundEmailSubject,
			inboundEmailBody: dto.inboundEmailBody,
			tenantId: dto.tenantId,
			threadId: dto.threadId,
			emailStatus: StatusTypes.PENDING,
			aiAnalysisStatus: StatusTypes.PENDING,
			attachments: dto.attachments,
			isBatchDocument: true,
			splitDocumentCount: dto.splitDocumentCount,
			attachmentFingerprint: dto.attachmentFingerprint,
			createdAt: Utils.getCurrentDate(),
			createdBy: 'System',
		};

		const emailSubmissionModel = EmailSubmissionsModel.create(submissionData);
		const createdSubmission = await EmailSubmissionsRepository.getInstance().Add<IEmailSubmissions>(emailSubmissionModel);
		return (createdSubmission as any)._id.toString();
	}



	//* -------------------------------------------------------------------------- */
	//*                        CREATE SUBMISSION METHOD                            */
	//* -------------------------------------------------------------------------- */
	//* Creates a single-file submission record.  When the email carried multiple
	//* attachments, pass parentSubmissionId + splitIndex to link it to the batch parent.
	public async createSubmission(dto: ICreateEmailSubmissionDTO): Promise<string> {
		const submissionData: Partial<IEmailSubmissions> = {
			reviewQueue: dto.reviewQueue,
			senderEmail: dto.senderEmail,
			recipientEmail: dto.recipientEmail,
			inboundEmailSubject: dto.inboundEmailSubject,
			inboundEmailBody: dto.inboundEmailBody,
			tenantId: dto.tenantId,
			threadId: dto.threadId,
			emailStatus: StatusTypes.PENDING,
			aiAnalysisStatus: StatusTypes.PENDING,
			attachments: [dto.attachment],
			...(dto.parentSubmissionId
				? { parentSubmissionId: dto.parentSubmissionId, splitIndex: dto.splitIndex, isBatchDocument: false }
				: { isBatchDocument: false, attachmentFingerprint: dto.attachmentFingerprint }
			),
			createdAt: Utils.getCurrentDate(),
			createdBy: 'System',
		};

		const emailSubmissionModel = EmailSubmissionsModel.create(submissionData);
		const createdSubmission = await EmailSubmissionsRepository.getInstance().Add<IEmailSubmissions>(emailSubmissionModel);
		return (createdSubmission as any)._id.toString();
	}



	//* -------------------------------------------------------------------------- */
	//*                   CREATE QUEUE-SCOPED BATCH PARENT METHOD                 */
	//* -------------------------------------------------------------------------- */
	public async createQueueGroupParent(dto: {
		reviewQueue: string;
		senderEmail: string;
		recipientEmail: string;
		inboundEmailSubject: string;
		inboundEmailBody: string;
		tenantId: string;
		threadId: string;
	}): Promise<string> {
		return EmailSubmissionsRepository.getInstance().upsertQueueGroupParent(dto);
	}


	//* -------------------------------------------------------------------------- */
	//*                             LIST EMAILS METHOD                             */
	//* -------------------------------------------------------------------------- */
	public async listEmails(data: IListEmailSubmissionsDTO, loggedInUser: IJWTPayload) {
		const filters: any[] = [
			{ param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND },
			{ param: 'reviewQueue', value: data.reviewQueue, operator: QueryOperators.AND },
			{ param: 'aiAnalysisStatus', value: StatusTypes.PENDING, operator: QueryOperators.AND, operationType: QueryOperationTypes.NOT_EQUALS },
		];

		const emailSubmissions: Record<string, any> = await EmailSubmissionsRepository.getInstance().GetAll(
			filters,
			true,
			data.continuationToken,
			data.pageSize,
			{ createdAt: -1 },
			listEmailSubmissionsResponseFields
		);

		const terminalStatuses = [StatusTypes.COMPLETED, StatusTypes.FAILED, StatusTypes.NEEDS_REVIEW,
		StatusTypes.COMPLIANT, StatusTypes.EXPIRING_SOON, StatusTypes.EXPIRED];

		const allDocs: any[] = emailSubmissions.data;
		const byId = new Map<string, any>();
		for (const doc of allDocs) {
			doc.children = [];
			byId.set(doc._id.toString(), doc);
		}

		const topLevel: any[] = [];
		for (const doc of allDocs) {
			if (doc.parentSubmissionId) {
				const parent = byId.get(doc.parentSubmissionId.toString());
				if (parent) {
					//* Only attach children when the parent has fully resolved —
					//* i.e. all siblings are done and the rollup status is terminal.
					//* This prevents partially-processed batches from surfacing
					//* individual completed children while siblings are still pending.
					if (terminalStatuses.includes(parent.aiAnalysisStatus)) {
						parent.children.push(doc);
					}
				}
				//* Child whose parent is not on this page (still pending / not yet
				//* rolled up) is silently dropped — never surfaced as a top-level row.
			} else {
				topLevel.push(doc);
			}
		}

		for (const doc of topLevel) {
			if (doc.children.length > 1) {
				doc.children.sort((a: any, b: any) => (a.splitIndex ?? 0) - (b.splitIndex ?? 0));
			}
		}

		//* In-code status filter: applied after tree assembly so batch parents are
		//* never excluded before their children can be attached.
		//*
		//* A batch parent passes if at least one child matches the requested status.
		//* Children on a passing parent are narrowed to only the matching ones so the
		//* response doesn't include irrelevant siblings.
		//*
		//* An individual doc (isBatchDocument=false, no parentSubmissionId) passes
		//* only when its own emailStatus matches.
		let filtered = topLevel;
		if (data.submissionStatus) {
			const status = data.submissionStatus;
			filtered = topLevel.reduce((acc: any[], doc: any) => {
				if (doc.isBatchDocument) {
					const matchingChildren = doc.children.filter((c: any) => c.emailStatus === status);
					if (matchingChildren.length > 0) {
						acc.push({ ...doc, children: matchingChildren });
					}
				} else {
					if (doc.emailStatus === status) acc.push(doc);
				}
				return acc;
			}, []);
		}

		const paginatedResult = Utils.pagination(
			!emailSubmissions.continuationToken,
			filtered,
			emailSubmissions.continuationToken,
			filtered.length
		);

		return paginatedResult;
	}




	//* -------------------------------------------------------------------------- */
	//*                        UPDATE INVOICE STATUS METHOD                        */
	//* -------------------------------------------------------------------------- */
	public async updateInvoiceStatus(data: IUpdateInvoiceStatusDTO, loggedInUser: IJWTPayload) {

		const emailSubmission: Partial<IEmailSubmissions> = await EmailSubmissionsRepository.getInstance().GetOneByParams(
			[
				{ param: '_id', value: new ObjectId(data.emailSubmissionId), operator: QueryOperators.AND },
				{ param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND },
				{ param: 'reviewQueue', value: ReviewQueues.INVOICES, operator: QueryOperators.AND },
			],
			['_id', 'attachments', 'isBatchDocument']
		);

		if (!emailSubmission) throw new CustomError(HttpStatusCode.NotFound, 'Invoice submission not found');

		if (emailSubmission?.isBatchDocument) throw new CustomError(HttpStatusCode.BadRequest, 'Parent batch document cannot be updated. Please update the individual attachment submissions.');

		const before = emailSubmission.attachments[0].aiAnalysisReport ?? {};
		const merged = { ...before, ...data.aiAnalysisReport };

		const reviewEvent = data.status === StatusTypes.COMPLETED ? AuditEventTypes.HUMAN_APPROVED
			: data.status === StatusTypes.FAILED ? AuditEventTypes.HUMAN_REJECTED
			: AuditEventTypes.HUMAN_EDITED;

		void AuditLogger.write({
			submissionId: data.emailSubmissionId,
			tenantId: loggedInUser.tenantId,
			event: reviewEvent,
			actor: { type: 'user', id: loggedInUser.id, name: loggedInUser.username },
			reviewQueue: ReviewQueues.INVOICES,
			before,
			after: merged,
			metadata: { status: data.status, mappedJobId: data.mappedJobId ?? null },
		});

		void AuditLogger.write({
			submissionId: data.emailSubmissionId,
			tenantId: loggedInUser.tenantId,
			event: AuditEventTypes.STATUS_CHANGED,
			actor: { type: 'user', id: loggedInUser.id, name: loggedInUser.username },
			reviewQueue: ReviewQueues.INVOICES,
			metadata: { status: data.status },
		});

		return EmailSubmissionsRepository.getInstance().updateAttachmentReviewDecision(
			data.emailSubmissionId,
			data.status,
			merged,
			loggedInUser.id,
			data.mappedJobId,
		);
	}




	//* -------------------------------------------------------------------------- */
	//*                       UPDATE DAILY LOG STATUS METHOD                       */
	//* -------------------------------------------------------------------------- */
	public async updateDailyLogStatus(data: IUpdateDailyLogStatusDTO, loggedInUser: IJWTPayload) {

		const emailSubmission: Partial<IEmailSubmissions> = await EmailSubmissionsRepository.getInstance().GetOneByParams(
			[
				{ param: '_id', value: new ObjectId(data.emailSubmissionId), operator: QueryOperators.AND },
				{ param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND },
				{ param: 'reviewQueue', value: ReviewQueues.DAILY_LOGS, operator: QueryOperators.AND },
			],
			['_id', 'attachments', 'isBatchDocument']
		);

		if (!emailSubmission) throw new CustomError(HttpStatusCode.NotFound, 'Daily log submission not found');

		if (emailSubmission?.isBatchDocument) throw new CustomError(HttpStatusCode.BadRequest, 'Parent batch document cannot be updated. Please update the individual attachment submissions');

		const before = emailSubmission.attachments[0].aiAnalysisReport ?? {};
		const merged = { ...before, ...data.aiAnalysisReport };

		const reviewEvent = data.status === StatusTypes.COMPLETED ? AuditEventTypes.HUMAN_APPROVED
			: data.status === StatusTypes.FAILED ? AuditEventTypes.HUMAN_REJECTED
			: AuditEventTypes.HUMAN_EDITED;

		void AuditLogger.write({
			submissionId: data.emailSubmissionId,
			tenantId: loggedInUser.tenantId,
			event: reviewEvent,
			actor: { type: 'user', id: loggedInUser.id, name: loggedInUser.username },
			reviewQueue: ReviewQueues.DAILY_LOGS,
			before,
			after: merged,
			metadata: { status: data.status, mappedJobId: data.mappedJobId ?? null },
		});

		void AuditLogger.write({
			submissionId: data.emailSubmissionId,
			tenantId: loggedInUser.tenantId,
			event: AuditEventTypes.STATUS_CHANGED,
			actor: { type: 'user', id: loggedInUser.id, name: loggedInUser.username },
			reviewQueue: ReviewQueues.DAILY_LOGS,
			metadata: { status: data.status },
		});

		return EmailSubmissionsRepository.getInstance().updateAttachmentReviewDecision(
			data.emailSubmissionId,
			data.status,
			merged,
			loggedInUser.id,
			data.mappedJobId,
		);
	}




	//* -------------------------------------------------------------------------- */
	//*                    UPDATE COMPLIANCE ALERT STATUS METHOD                   */
	//* -------------------------------------------------------------------------- */
	public async updateComplianceAlertStatus(data: IUpdateComplianceAlertStatusDTO, loggedInUser: IJWTPayload) {

		const emailSubmission: Partial<IEmailSubmissions> = await EmailSubmissionsRepository.getInstance().GetOneByParams(
			[
				{ param: '_id', value: new ObjectId(data.emailSubmissionId), operator: QueryOperators.AND },
				{ param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND },
				{ param: 'reviewQueue', value: ReviewQueues.COMPLIANCE_ALERT, operator: QueryOperators.AND },
			],
			['_id', 'attachments', 'isBatchDocument']
		);

		if (!emailSubmission) throw new CustomError(HttpStatusCode.NotFound, 'Compliance alert submission not found');

		if (emailSubmission?.isBatchDocument) throw new CustomError(HttpStatusCode.BadRequest, 'Parent batch document cannot be updated. Please update the individual attachment submissions.');

		const { emailStatus, isExpired, isExpiringSoon, isCompliant } = computeComplianceStatus(data.aiAnalysisReport.expirationDate);

		const before = emailSubmission.attachments[0].aiAnalysisReport ?? {};
		const merged = {
			...before,
			...data.aiAnalysisReport,
			isExpired,
			isExpiringSoon,
			isCompliant,
		};

		void AuditLogger.write({
			submissionId: data.emailSubmissionId,
			tenantId: loggedInUser.tenantId,
			event: AuditEventTypes.HUMAN_EDITED,
			actor: { type: 'user', id: loggedInUser.id, name: loggedInUser.username },
			reviewQueue: ReviewQueues.COMPLIANCE_ALERT,
			before,
			after: merged,
			metadata: { computedStatus: emailStatus },
		});

		void AuditLogger.write({
			submissionId: data.emailSubmissionId,
			tenantId: loggedInUser.tenantId,
			event: AuditEventTypes.STATUS_CHANGED,
			actor: { type: 'user', id: loggedInUser.id, name: loggedInUser.username },
			reviewQueue: ReviewQueues.COMPLIANCE_ALERT,
			metadata: { status: emailStatus },
		});

		return EmailSubmissionsRepository.getInstance().updateAttachmentReviewDecision(
			data.emailSubmissionId,
			emailStatus,
			merged,
			loggedInUser.id,
		);
	}
}



export default new EmailSubmissionsService();