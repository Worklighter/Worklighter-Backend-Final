import { ObjectId } from 'mongodb';
import { MONGODB_COLLECTIONS } from '../../utils/constants';
import BaseRepository from '../../core/repositories/baseRepository';
import { EmailSubmissionAttachmentStructure, ITokenConsumptionReceipt, IClassificationResult } from './emailSubmissionsInterface';
import StatusTypes from '../../core/enums/statusTypes';
import { Logger } from '../../utils/helpers/logger';


class EmailSubmissionsRepository extends BaseRepository {
    private static instance: EmailSubmissionsRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.EMAIL_SUBMISSIONS, []);
    }

    public static getInstance(): EmailSubmissionsRepository {
        if (!EmailSubmissionsRepository.instance) {
            EmailSubmissionsRepository.instance = new EmailSubmissionsRepository();
        }
        return EmailSubmissionsRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }

    //* -------------------------------------------------------------------------- */
    //*                      IDEMPOTENCY CHECK METHOD                              */
    //* -------------------------------------------------------------------------- */
    public async submissionExistsForDelivery(threadId: string, attachmentFingerprint: string): Promise<boolean> {
        try {
            const doc = await this.collection.findOne(
                {
                    threadId,
                    attachmentFingerprint,
                    parentSubmissionId: { $exists: false },
                },
                { projection: { _id: 1 } }
            );
            return doc !== null;
        } catch (error: any) {
            console.error('An error occurred during idempotency check', error);
            return false;
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                  UPDATE ATTACHMENT ANALYSIS REPORT METHOD                  */
    //* -------------------------------------------------------------------------- */
    public async updateAttachmentAnalysisReport(
        submissionId: string,
        attachmentOrder: number,
        aiAnalysisReport: any,
        aiAnalysisStatus: string,
        flaggedForHumanReview: boolean = false,
        tokenConsumptionReceipt?: ITokenConsumptionReceipt
    ): Promise<void> {
        try {
            const updateData: Record<string, any> = {
                'attachments.$.aiAnalysisStatus': aiAnalysisStatus,
                'attachments.$.flaggedForHumanReview': flaggedForHumanReview,
            };

            if (aiAnalysisReport) {
                updateData['attachments.$.aiAnalysisReport'] = aiAnalysisReport;
            }

            if (tokenConsumptionReceipt) {
                updateData['attachments.$.tokenConsumptionReceipt'] = tokenConsumptionReceipt;
            }

            await this.collection.updateOne(
                { _id: new ObjectId(submissionId), 'attachments.order': attachmentOrder },
                { $set: updateData }
            );

            //* Compliance alert attachments store compliant/expiring_soon/expired on the attachment.
            //* For the outer aiAnalysisStatus rollup we treat all three as COMPLETED — the
            //* submission-level status only needs to signal: done / needs review / failed.
            //* The compliance distinction (compliant vs expiring_soon vs expired) lives on
            //* the attachment aiAnalysisReport.isExpired + the emailStatus field.
            const statusPriority = [
                StatusTypes.NEEDS_REVIEW,
                StatusTypes.FAILED,
                StatusTypes.COMPLETED,
                StatusTypes.COMPLIANT,
                StatusTypes.EXPIRING_SOON,
                StatusTypes.EXPIRED,
                StatusTypes.IN_PROGRESS,
                StatusTypes.PENDING,
            ];

            //* Compliance attachment statuses (compliant/expiring_soon/expired) are
            //* normalised to COMPLETED for the outer aiAnalysisStatus so the rollup
            //* stays consistent with non-compliance queues.
            const complianceTerminals = new Set([
                StatusTypes.COMPLIANT,
                StatusTypes.EXPIRING_SOON,
                StatusTypes.EXPIRED,
            ]);

            await this.collection.updateOne(
                { _id: new ObjectId(submissionId) },
                [
                    {
                        $set: {
                            aiAnalysisStatus: {
                                $let: {
                                    vars: { statuses: '$attachments.aiAnalysisStatus' },
                                    in: {
                                        $switch: {
                                            branches: statusPriority.map(s => ({
                                                case: { $in: [s, '$$statuses'] },
                                                then: complianceTerminals.has(s) ? StatusTypes.COMPLETED : s,
                                            })),
                                            default: StatusTypes.PENDING,
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]
            );

            const updatedDoc = await this.collection.findOne(
                { _id: new ObjectId(submissionId) },
                { projection: { parentSubmissionId: 1 } }
            );
            if (updatedDoc?.parentSubmissionId) {
                const directParentId = updatedDoc.parentSubmissionId.toString();
                await this.rollUpParentStatusIfChildrenComplete(directParentId);

                //* Chain: check if the direct parent itself has a parent (batch grandparent)
                const directParent = await this.collection.findOne(
                    { _id: new ObjectId(directParentId) },
                    { projection: { parentSubmissionId: 1 } }
                );
                if (directParent?.parentSubmissionId) {
                    await this.rollUpParentStatusIfChildrenComplete(directParent.parentSubmissionId.toString());
                }
            }
        } catch (error: any) {
            console.error('An error occurred while updating attachment analysis report', error);
            throw new Error(error);
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                   UPDATE ATTACHMENT JOB ID METHOD                         */
    //* -------------------------------------------------------------------------- */
    public async updateAttachmentJobId(
        submissionId: string,
        attachmentOrder: number,
        mappedJobId: string | null
    ): Promise<void> {
        try {
            await this.collection.updateOne(
                { _id: new ObjectId(submissionId), 'attachments.order': attachmentOrder },
                { $set: { 'attachments.$.mappedJobId': mappedJobId } }
            );
        } catch (error: any) {
            Logger.Console(`Failed to update mappedJobId for submission ${submissionId}: ${error?.message}`, 'warn');
        }
    }


    //* -------------------------------------------------------------------------- */
    //*              ROLL UP PARENT STATUS WHEN ALL CHILDREN COMPLETE              */
    //* -------------------------------------------------------------------------- */
    private async rollUpParentStatusIfChildrenComplete(parentSubmissionId: string): Promise<void> {
        try {
            const terminalStatuses: string[] = [
                StatusTypes.COMPLETED,
                StatusTypes.FAILED,
                StatusTypes.NEEDS_REVIEW,
                StatusTypes.SPLIT_PROCESSED,
                StatusTypes.COMPLIANT,
                StatusTypes.EXPIRING_SOON,
                StatusTypes.EXPIRED,
            ];

            //* Fetch all direct children for this parent
            const children = await this.collection
                .find(
                    { parentSubmissionId },
                    { projection: { _id: 1, aiAnalysisStatus: 1 } }
                )
                .toArray();

            if (children.length === 0) return;

            //* Wait until every direct child has reached a terminal state
            const allTerminal = children.every(c => terminalStatuses.includes(c.aiAnalysisStatus));
            if (!allTerminal) return;

            //* Compliance terminals count as COMPLETED at the parent rollup level.
            //* The emailStatus on each child carries the compliance distinction.
            const rollupPriority = [
                StatusTypes.NEEDS_REVIEW,
                StatusTypes.FAILED,
                StatusTypes.COMPLETED,
            ];

            const effectiveStatuses: string[] = [];

            for (const child of children) {
                if (child.aiAnalysisStatus === StatusTypes.SPLIT_PROCESSED) {
                    const grandchildren = await this.collection
                        .find(
                            { parentSubmissionId: child._id.toString() },
                            { projection: { aiAnalysisStatus: 1 } }
                        )
                        .toArray();

                    for (const gc of grandchildren) {
                        effectiveStatuses.push(gc.aiAnalysisStatus as string);
                    }
                } else {
                    effectiveStatuses.push(child.aiAnalysisStatus as string);
                }
            }

            const rolledUpStatus = rollupPriority.find(s => effectiveStatuses.includes(s)) ?? StatusTypes.COMPLETED;

            await this.collection.updateOne(
                { _id: new ObjectId(parentSubmissionId) },
                { $set: { aiAnalysisStatus: rolledUpStatus } }
            );
        } catch (error: any) {
            console.error('An error occurred while rolling up parent aiAnalysisStatus', error);
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                   UPDATE ATTACHMENT REVIEW DECISION METHOD                 */
    //* -------------------------------------------------------------------------- */
    public async updateAttachmentReviewDecision(
        submissionId: string,
        emailStatus: string,
        aiAnalysisReport: Record<string, any>,
        updatedBy: string,
        mappedJobId?: string | null,
    ): Promise<any> {
        try {
            const setFields: Record<string, any> = {
                emailStatus,
                'attachments.0.aiAnalysisReport': aiAnalysisReport,
                updatedAt: new Date().toISOString(),
                updatedBy,
            };

            if (mappedJobId !== undefined) {
                setFields['attachments.0.mappedJobId'] = mappedJobId;
            }

            return await this.collection.findOneAndUpdate(
                { _id: new ObjectId(submissionId)},
                { $set: setFields },
                { returnDocument: 'after' }
            );
        } catch (error: any) {
            console.error('An error occurred while updating attachment review decision', error);
            throw new Error(error);
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                      UPDATE REVIEW QUEUE METHOD                            */
    //* -------------------------------------------------------------------------- */
    public async updateReviewQueue(submissionId: string, reviewQueue: string): Promise<void> {
        try {
            await this.collection.updateOne(
                { _id: new ObjectId(submissionId) },
                { $set: { reviewQueue } }
            );
        } catch (error: any) {
            console.error('An error occurred while updating submission review queue', error);
            throw new Error(error);
        }
    }

    public async updateReviewQueueIfUnclassified(submissionId: string, reviewQueue: string): Promise<void> {
        try {
            await this.collection.updateOne(
                { _id: new ObjectId(submissionId), reviewQueue: 'unclassified' },
                { $set: { reviewQueue } }
            );
        } catch (error: any) {
            console.error('An error occurred while updating parent submission review queue', error);
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                  SAVE ATTACHMENT CLASSIFICATION METHOD                     */
    //* -------------------------------------------------------------------------- */
    public async saveAttachmentClassification(
        submissionId: string,
        attachmentOrder: number,
        classificationResult: IClassificationResult
    ): Promise<void> {
        try {
            await this.collection.updateOne(
                { _id: new ObjectId(submissionId), 'attachments.order': attachmentOrder },
                { $set: { 'attachments.$.classificationResult': classificationResult } }
            );
        } catch (error: any) {
            console.error('An error occurred while saving attachment classification', error);
            throw new Error(error);
        }
    }



    //* -------------------------------------------------------------------------- */
    //*              MARK ATTACHMENT AS SPLIT PROCESSED METHOD                     */
    //* -------------------------------------------------------------------------- */
    public async markAttachmentAsSplitProcessed(
        submissionId: string,
        attachmentOrder: number,
        splitDocumentCount: number
    ): Promise<void> {
        try {
            await this.collection.updateOne(
                { _id: new ObjectId(submissionId), 'attachments.order': attachmentOrder },
                {
                    $set: {
                        'attachments.$.aiAnalysisStatus': StatusTypes.SPLIT_PROCESSED,
                        isBatchDocument: true,
                        splitDocumentCount,
                    }
                }
            );
        } catch (error: any) {
            console.error('An error occurred while marking attachment as split processed', error);
            throw new Error(error);
        }
    }



    //* -------------------------------------------------------------------------- */
    //*                    INSERT CHILD SUBMISSION METHOD                          */
    //* -------------------------------------------------------------------------- */
    public async insertChildSubmission(data: {
        parentSubmissionId: string;
        splitIndex: number;
        reviewQueue: string;
        senderEmail: string;
        recipientEmail: string;
        inboundEmailSubject: string;
        inboundEmailBody: string;
        tenantId: string;
        threadId: string;
        attachment: EmailSubmissionAttachmentStructure;
    }): Promise<string> {
        try {
            const document = {
                reviewQueue: data.reviewQueue,
                senderEmail: data.senderEmail,
                recipientEmail: data.recipientEmail,
                inboundEmailSubject: data.inboundEmailSubject,
                inboundEmailBody: data.inboundEmailBody,
                tenantId: data.tenantId,
                threadId: data.threadId,
                emailStatus: StatusTypes.PENDING,
                aiAnalysisStatus: StatusTypes.IN_PROGRESS,
                attachments: [data.attachment],
                parentSubmissionId: data.parentSubmissionId,
                splitIndex: data.splitIndex,
                isBatchDocument: false,
                createdAt: new Date().toISOString(),
                createdBy: 'System',
            };

            const result = await this.collection.insertOne(document);
            return result.insertedId.toString();
        } catch (error: any) {
            console.error('An error occurred while inserting child submission', error);
            throw new Error(error);
        }
    }



    //* -------------------------------------------------------------------------- */
    //*           UPSERT QUEUE-SCOPED BATCH PARENT (thread + queue key)           */
    //* -------------------------------------------------------------------------- */
    //* Atomically creates or returns the parent record for a (threadId, tenantId,
    //* reviewQueue) group. Safe to call concurrently — only one parent is ever
    //* inserted per group due to the findOneAndUpdate upsert.
    public async upsertQueueGroupParent(doc: {
        threadId: string;
        tenantId: string;
        reviewQueue: string;
        senderEmail: string;
        recipientEmail: string;
        inboundEmailSubject: string;
        inboundEmailBody: string;
    }): Promise<string> {
        try {
            const filter = {
                threadId: doc.threadId,
                tenantId: doc.tenantId,
                reviewQueue: doc.reviewQueue,
                isBatchDocument: true,
                parentSubmissionId: { $exists: false },
            };
            const now = new Date().toISOString();
            const result = await this.collection.findOneAndUpdate(
                filter,
                {
                    $setOnInsert: {
                        ...filter,
                        senderEmail: doc.senderEmail,
                        recipientEmail: doc.recipientEmail,
                        inboundEmailSubject: doc.inboundEmailSubject,
                        inboundEmailBody: doc.inboundEmailBody,
                        emailStatus: 'pending',
                        aiAnalysisStatus: 'pending',
                        attachments: [],
                        splitDocumentCount: 0,
                        createdAt: now,
                        createdBy: 'System',
                    },
                },
                { upsert: true, returnDocument: 'after' }
            );
            return (result?._id).toString();
        } catch (error: any) {
            console.error('An error occurred while upserting queue group parent', error);
            throw new Error(error);
        }
    }


    //* -------------------------------------------------------------------------- */
    //*           LINK STANDALONE SUBMISSION TO QUEUE-SCOPED PARENT               */
    //* -------------------------------------------------------------------------- */
    public async linkSubmissionToParent(submissionId: string, parentSubmissionId: string, splitIndex: number): Promise<void> {
        try {
            await this.collection.updateOne(
                { _id: new ObjectId(submissionId) },
                { $set: { parentSubmissionId, splitIndex, isBatchDocument: false } }
            );
        } catch (error: any) {
            console.error('An error occurred while linking submission to parent', error);
        }
    }


    //* -------------------------------------------------------------------------- */
    //*         FIND UNLINKED SIBLINGS BY THREAD + QUEUE (for grouping)            */
    //* -------------------------------------------------------------------------- */
    public async findUnlinkedSiblings(
        threadId: string,
        tenantId: string,
        reviewQueue: string,
        excludeSubmissionId: string
    ): Promise<Array<{ _id: any }>> {
        try {
            return await this.collection
                .find(
                    {
                        threadId,
                        tenantId,
                        reviewQueue,
                        parentSubmissionId: { $exists: false },
                        _id: { $ne: new ObjectId(excludeSubmissionId) },
                    },
                    { projection: { _id: 1 } }
                )
                .toArray();
        } catch (error: any) {
            console.error('An error occurred while finding unlinked siblings', error);
            return [];
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                       DELETE SUBMISSION METHOD                             */
    //* -------------------------------------------------------------------------- */
    public async deleteSubmission(submissionId: string): Promise<void> {
        try {
            await this.collection.deleteOne({ _id: new ObjectId(submissionId) });
        } catch (error: any) {
            console.error('An error occurred while deleting submission', error);
            throw new Error(error);
        }
    }



    //* -------------------------------------------------------------------------- */
    //*                   COUNT CHILDREN OF PARENT METHOD                          */
    //* -------------------------------------------------------------------------- */
    public async countChildrenOfParent(parentSubmissionId: string): Promise<number> {
        try {
            return await this.collection.countDocuments({ parentSubmissionId });
        } catch (error: any) {
            console.error('An error occurred while counting children of parent', error);
            throw new Error(error);
        }
    }



    //* -------------------------------------------------------------------------- */
    //*               UPDATE BATCH PARENT SPLIT COUNT METHOD                       */
    //* -------------------------------------------------------------------------- */
    public async updateBatchParentSplitCount(parentSubmissionId: string): Promise<void> {
        try {
            const count = await this.collection.countDocuments({ parentSubmissionId });
            await this.collection.updateOne(
                { _id: new ObjectId(parentSubmissionId) },
                { $set: { splitDocumentCount: count } }
            );
        } catch (error: any) {
            console.error('An error occurred while updating batch parent split count', error);
            throw new Error(error);
        }
    }
}



export default EmailSubmissionsRepository;