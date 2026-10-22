const cron = require('node-cron');

import QueryOperators from "../enums/queryOperators";
import ReviewQueues from "../enums/reviewQueues";
import StatusTypes from "../enums/statusTypes";
import EmailSubmissionsRepository from "../../modules/emailSubmissions/emailSubmissionsRepository";
import CoiAlertConfigRepository from "../../modules/coiConfigs/coiConfigsRepository";
import { ICoiAlertConfig, IAlertSchedule } from "../../modules/coiConfigs/coiConfigsInterface";
import { CoiExpiringSoonAlertJobMetaData, IEmailSubmissions } from "../../modules/emailSubmissions/emailSubmissionsInterface";
import EmailsJobProcessor from "./emailsJobProcessor";
import Redis from "../../integration/redis";
import { Logger } from "../../utils/helpers/logger";

class CoiExpiringSoonAlertsCron {
    private static instance: CoiExpiringSoonAlertsCron | null = null;
    private scheduledTask: any = null;
    private readonly scheduleExpression = '59 23 * * *';
    private readonly idempotencyTtlSeconds = 3 * 24 * 60 * 60;

    private constructor() { }

    public static getInstance(): CoiExpiringSoonAlertsCron {
        if (!CoiExpiringSoonAlertsCron.instance) {
            CoiExpiringSoonAlertsCron.instance = new CoiExpiringSoonAlertsCron();
        }
        return CoiExpiringSoonAlertsCron.instance;
    }

    public start(): void {
        if (this.scheduledTask) {
            Logger.Console('COI expiring soon alerts cron is already running', 'warn');
            return;
        }

        this.scheduledTask = cron.schedule(this.scheduleExpression, async () => {
            await this.run();
        });

        Logger.Console(`COI expiring soon alerts cron scheduled: ${this.scheduleExpression}`, 'info');
    }

    public async run(): Promise<void> {
        try {
            const submissions = await EmailSubmissionsRepository.getInstance().GetAll<IEmailSubmissions[]>(
                [
                    { param: 'reviewQueue', value: ReviewQueues.COMPLIANCE_ALERT, operator: QueryOperators.AND },
                    // { param: 'emailStatus', value: StatusTypes.EXPIRING_SOON, operator: QueryOperators.AND },
                ],
                false,
                null,
                undefined,
                { createdAt: -1 },
                [
                    '_id',
                    'tenantId',
                    'reviewQueue',
                    'emailStatus',
                    'inboundEmailSubject',
                    'attachments',
                    'aiAnalysisReport',
                    'vendorEmail',
                    'externalEmail',
                ]
            );

            Logger.Console(`COI expiring soon alerts cron found ${submissions.length} candidate submissions`, 'info');

            for (const submission of submissions) {
                await this.enqueueSubmissionAlerts(submission);
            }
        } catch (error: any) {
            Logger.Console(`COI expiring soon alerts cron failed: ${error.message}`, 'error');
        }
    }

    private async enqueueSubmissionAlerts(submission: any): Promise<void> {
        const analysisReport = this.getComplianceAnalysisReport(submission);

        const expirationDate = analysisReport?.expirationDate;
        if (!expirationDate) {
            Logger.Console(`Skipping COI alert for submission ${submission._id}: missing expirationDate`, 'warn');
            return;
        }

        const daysUntilExpiration = this.getDaysUntilExpiration(expirationDate);
        if (daysUntilExpiration < 0) return;

        const config = await CoiAlertConfigRepository.getInstance().GetOneByParams<ICoiAlertConfig>(
            [{ param: 'tenantId', value: submission.tenantId, operator: QueryOperators.AND }],
            [
                'tenantId',
                'externalAlertMode',
                'externalSchedules',
                'internalAlertMode',
                'internalSchedules',
                'internalCCRecipients',
            ]
        );

        if (!config) {
            Logger.Console(`Skipping COI alert for submission ${submission._id}: missing COI alert config for tenant ${submission.tenantId}`, 'warn');
            return;
        }

        const vendorName = analysisReport?.vendor || submission.vendorName || 'Unknown vendor';
        const baseJobData = {
            emailSubmissionId: submission._id.toString(),
            tenantId: submission.tenantId,
            vendorName,
            expirationDate: new Date(expirationDate).toISOString(),
            daysUntilExpiration,
            inboundEmailSubject: submission.inboundEmailSubject || 'N/A',
            reviewQueue: ReviewQueues.COMPLIANCE_ALERT,
        };

        if (config.internalAlertMode === 'auto' && this.scheduleMatches(config.internalSchedules, daysUntilExpiration)) {
            const recipients = this.uniqueEmails(config.internalCCRecipients || []);
            if (recipients.length) {
                await this.enqueueAlert({
                    ...baseJobData,
                    recipientType: 'internal',
                    recipients,
                });
            }
        }

        if (config.externalAlertMode === 'auto' && this.scheduleMatches(config.externalSchedules, daysUntilExpiration)) {
            const vendorEmail = this.getVendorEmail(submission, analysisReport);
            if (!vendorEmail) {
                Logger.Console(`Skipping external COI alert for submission ${submission._id}: no vendorEmail found on submission data`, 'warn');
                return;
            }

            await this.enqueueAlert({
                ...baseJobData,
                recipientType: 'external',
                recipients: [vendorEmail],
                vendorEmail,
            });
        }
    }

    private async enqueueAlert(jobData: CoiExpiringSoonAlertJobMetaData): Promise<void> {
        const today = this.getLocalDateKey(new Date());
        const jobId = `coi-expiring-alert:${jobData.emailSubmissionId}:${today}:${jobData.recipientType}`;
        const safeJobId = jobId.replace(/[:\s]/g, '-');
        const idempotencyKey = `bullmq:${jobId}`;
        const canEnqueue = await this.reserveIdempotencyKey(idempotencyKey);

        if (!canEnqueue) {
            Logger.Console(`Skipping duplicate COI expiring soon alert job ${jobId}`, 'info');
            return;
        }

        try {
            await EmailsJobProcessor.getInstance().enqueueCoiExpiringSoonAlertJob(jobData, safeJobId);
            Logger.Console(`Queued COI expiring soon ${jobData.recipientType} alert job ${jobId}`, 'info');
        } catch (error) {
            await this.releaseIdempotencyKey(idempotencyKey);
            throw error;
        }
    }

    private getComplianceAnalysisReport(submission: any): Record<string, any> | null {

        const attachmentReports = Array.isArray(submission.attachments)
            ? submission.attachments.map((attachment: any) => attachment?.aiAnalysisReport).filter(Boolean)
            : [];

        return attachmentReports.find((report: any) => report?.expirationDate)
            || submission.aiAnalysisReport
            || null;
    }

    private getVendorEmail(submission: any, analysisReport: any): string | null {
        const candidates = [
            submission.vendorEmail,
            submission.externalEmail,
            submission.vendor?.email,
            analysisReport?.vendorEmail,
            analysisReport?.externalEmail,
            analysisReport?.vendor?.email,
        ];

        return this.uniqueEmails(candidates)[0] || null;
    }

    private scheduleMatches(schedules: IAlertSchedule[] = [], daysUntilExpiration: number): boolean {
        return schedules.some(schedule => schedule.enabled && schedule.days === daysUntilExpiration);
    }

    private getDaysUntilExpiration(expirationDate: string | Date): number {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const expiration = new Date(expirationDate);
        expiration.setHours(0, 0, 0, 0);

        const millisecondsPerDay = 24 * 60 * 60 * 1000;
        return Math.ceil((expiration.getTime() - today.getTime()) / millisecondsPerDay);
    }

    private uniqueEmails(values: any[]): string[] {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return Array.from(new Set(
            values
                .filter(value => typeof value === 'string')
                .map(value => value.trim().toLowerCase())
                .filter(value => emailRegex.test(value))
        ));
    }

    private async reserveIdempotencyKey(key: string): Promise<boolean> {
        const client = Redis.getInstance().getClient();

        if (!client || !Redis.getInstance().checkConnection()) return true;

        const result = await client.set(key, '1', {
            NX: true,
            EX: this.idempotencyTtlSeconds,
        });

        return result === 'OK';
    }

    private async releaseIdempotencyKey(key: string): Promise<void> {
        const client = Redis.getInstance().getClient();
        if (!client || !Redis.getInstance().checkConnection()) return;
        await client.del(key);
    }

    private getLocalDateKey(date: Date): string {
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

export default CoiExpiringSoonAlertsCron;
