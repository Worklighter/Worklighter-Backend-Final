import { Job, Queue, Worker } from "bullmq";
import os from "os";
import { Application } from "../../app";
import BackgroundJobs from "../enums/backgroundJobs";
import KnowledgeBaseIngestionStatus from "../enums/knowledgeBaseIngestionStatus";
import { BackgroundJobSettings, BullmqQueues } from "../../utils/constants";
import { Logger } from "../../utils/helpers/logger";
import { BullMQ } from "../interfaces/bullMQ";
import EnvironmentTypes from "../enums/environmentTypes";
import KnowledgeBaseRepository from "../../modules/knowledgeBase/knowledgeBaseRepository";
import AzureAISearch from "../../integration/azure/aiSearch";
import { ObjectId } from "mongodb";
import { Utils } from "../../utils/utils";
import { IKnowledgeBaseContentChunk } from "../../modules/knowledgeBase/knowledgeBaseInterface";
import CostCodesRepository from "../../modules/costCodes/costCodesRepository";
import CostCodesModel from "../../modules/costCodes/costCodesModel";
import { CostCodeType } from "../../modules/costCodes/costCodesInterface";
import WCCodesRepository from "../../modules/wcCodes/wcCodesRepository";
import WCCodesModel from "../../modules/wcCodes/wcCodesModel";
import { WCCodeType } from "../../modules/wcCodes/wcCodesInterface";

export interface KnowledgeBaseProcessingJobMetaData {
    id: string;
}

class KnowledgeBaseJobProcessor implements BullMQ {
    private static instance: KnowledgeBaseJobProcessor | null = null;
    private queues: Record<string, Queue> = {};
    private workers: Record<string, Worker> = {};
    private readonly redisConfig = Application.redisConf;
    private workerConcurrency: number = 2;

    private constructor() { }

    private readonly queueProcessors: { [queueName: string]: (job: Job) => Promise<void> } = {
        [BullmqQueues.KNOWLEDGE_BASE_QUEUES.PROCESS_KNOWLEDGE_BASE_WORKLIGHTER]: this.processKnowledgeBase.bind(this),
    };

    public static getInstance(): KnowledgeBaseJobProcessor {
        if (!KnowledgeBaseJobProcessor.instance) {
            KnowledgeBaseJobProcessor.instance = new KnowledgeBaseJobProcessor();
        }
        return KnowledgeBaseJobProcessor.instance;
    }

    public async initQueues(): Promise<void> {
        const queueNames = Object.values(BullmqQueues.KNOWLEDGE_BASE_QUEUES);
        for (const queueName of queueNames) {
            this.queues[queueName] = new Queue(queueName, {
                connection: { url: this.redisConfig.url },
                defaultJobOptions: {
                    removeOnComplete: true,
                },
            });
        }
        Logger.Console(`Knowledge Base Background Job Queues initialized successfully`, 'info');
    }

    public async initWorkers(): Promise<void> {
        const availableCores = os.cpus().length;
        const configuredConcurrency = parseInt(process.env.KNOWLEDGE_BASE_JOB_CONCURRENCY || '', 10);
        if (Number.isFinite(configuredConcurrency) && configuredConcurrency > 0) {
            this.workerConcurrency = configuredConcurrency;
        } else {
            // Default to 1 to avoid Azure Search/OpenAI burst throttling in lower-tier environments.
            this.workerConcurrency = 1;
        }

        Object.keys(this.queueProcessors).forEach(async (queueName) => {
            this.workers[queueName] = new Worker(queueName, this.queueProcessors[queueName], {
                connection: { url: this.redisConfig.url },
                concurrency: this.workerConcurrency,
            });

            await this.setupWorkerEventListeners(this.workers[queueName], queueName);
        });

        Logger.Console(`Workers created for Knowledge Base Job Queues`, 'info');
    }

    public enqueueKnowledgeBaseProcessingJob(jobData: KnowledgeBaseProcessingJobMetaData) {
        this.queues[BullmqQueues.KNOWLEDGE_BASE_QUEUES.PROCESS_KNOWLEDGE_BASE_WORKLIGHTER].add(
            BackgroundJobs.PROCESS_KNOWLEDGE_BASE_WORKLIGHTER,
            jobData,
            {
                delay: Application.conf.ENV === EnvironmentTypes.LOCAL ? 0 : BackgroundJobSettings.DEFAULT_DELAY_IN_PROCESSING,
                backoff: { type: BackgroundJobSettings.BACKOFF_STRATEGY.backoffType as any, delay: BackgroundJobSettings.BACKOFF_STRATEGY.backoffDelay },
                attempts: BackgroundJobSettings.MAX_RETRY,
                removeOnFail: BackgroundJobSettings.REMOVE_ON_FAIL,
            }
        );
    }

    private normalizeCodeType(type: string): string {
        return (type || '').toLowerCase().replace(/[\s_-]/g, '');
    }

    private isCostCodeType(type: string): boolean {
        const normalized = this.normalizeCodeType(type);
        return normalized === 'costcode' || normalized === 'costcodes' || normalized === 'cost';
    }

    private isWCCodeType(type: string): boolean {
        const normalized = this.normalizeCodeType(type);
        return normalized === 'comcode' || normalized === 'comcodes' || normalized === 'wccode' || normalized === 'wccodes' || normalized === 'compcode' || normalized === 'wc';
    }

    private async syncCodeTablesFromChunks(chunks: IKnowledgeBaseContentChunk[], userId: string, tenantId: string) {
        const costCodesRepo = CostCodesRepository.getInstance();
        const wcCodesRepo = WCCodesRepository.getInstance();

        for (const chunk of chunks || []) {
            const codeNumber = (chunk?.code || '').trim();
            const type = (chunk?.type || '').trim();
            const category = (chunk?.title || 'Auto Imported').trim();
            const description = (chunk?.description || category || codeNumber).trim();

            if (!codeNumber || !type) {
                continue;
            }

            if (this.isCostCodeType(type)) {
                const existingCostCode = await costCodesRepo.GetOneByParams<any>([
                    { param: 'tenantId', value: tenantId, operator: 'AND' },
                    { param: 'codeNumber', value: codeNumber, operator: 'AND' },
                ], ['_id']);

                if (!existingCostCode) {
                    const newCostCode = CostCodesModel.create({
                        codeNumber,
                        category,
                        description,
                        type: CostCodeType.CUSTOM,
                        tenantId,
                        isActive: true,
                        createdAt: Utils.getCurrentDate(),
                        createdBy: userId,
                        updatedAt: null,
                        updatedBy: null,
                        deletedAt: null,
                    } as any);

                    await costCodesRepo.Add(newCostCode);
                    Logger.Console(`Imported cost code from KB chunk: ${codeNumber}`, 'info');
                }
                continue;
            }

            if (this.isWCCodeType(type)) {
                const existingWCCode = await wcCodesRepo.GetOneByParams<any>([
                    { param: 'tenantId', value: tenantId, operator: 'AND' },
                    { param: 'codeNumber', value: codeNumber, operator: 'AND' },
                ], ['_id']);

                if (!existingWCCode) {
                    const newWCCode = WCCodesModel.create({
                        codeNumber,
                        category,
                        description,
                        type: WCCodeType.CUSTOM,
                        tenantId,
                        userId,
                        isActive: true,
                        createdAt: new Date(Utils.getCurrentDate()),
                        createdBy: userId,
                        updatedAt: null,
                        updatedBy: null,
                        deletedAt: null,
                    } as any);

                    await wcCodesRepo.Add(newWCCode);
                    Logger.Console(`Imported WC code from KB chunk: ${codeNumber}`, 'info');
                }
            }
        }
    }

    private async processKnowledgeBase(job: Job) {
        const data = job.data as KnowledgeBaseProcessingJobMetaData;
        const id = data?.id;

        if (!id || !ObjectId.isValid(id)) {
            throw new Error(`Invalid knowledge base record id: ${id}`);
        }

        const repo = KnowledgeBaseRepository.getInstance();
        const record = await repo.GetOneByParams<any>([
            { param: '_id', value: new ObjectId(id), operator: 'AND' },
        ]);

        if (!record) {
            throw new Error(`Knowledge base record not found: ${id}`);
        }

        if (record.ingestionStatus === KnowledgeBaseIngestionStatus.COMPLETED && record.chunkCreated && record.vectorDocumentId) {
            Logger.Console(`KB ingestion skipped (already completed): ${id}`, 'info');
            return;
        }

        const startedAt = Utils.getCurrentDate();
        const startMs = Date.now();

        await repo.Update(new ObjectId(id), {
            ingestionStatus: KnowledgeBaseIngestionStatus.IN_PROGRESS,
            ingestionStartedAt: startedAt,
            ingestionError: null,
        });

        try {
            const chunks = Array.isArray(record.content) ? record.content : [];
            await this.syncCodeTablesFromChunks(chunks, record.userId, record.tenantId);

            const { documentId, totalChunks } = await AzureAISearch.getInstance().embedAndIndex({
                recordId: id,
                title: record.title,
                contentChunks: chunks,
                filePath: record.filePath || null,
                userId: record.userId,
                tenantId: record.tenantId,
            });

            const completedAt = Utils.getCurrentDate();
            const processingTime = Math.max(0, Math.ceil((Date.now() - startMs) / 1000));

            await repo.Update(new ObjectId(id), {
                ingestionStatus: KnowledgeBaseIngestionStatus.COMPLETED,
                ingestionCompletedAt: completedAt,
                ingestionError: null,
                vectorDocumentId: documentId,
                chunkCreated: true,
                chunkIndex: totalChunks,
                processingTime,
            });

            Logger.Console(`KB ingestion completed: ${id} (${totalChunks} chunks, ${processingTime}s)`, 'info');
        } catch (error: any) {
            const failedAt = Utils.getCurrentDate();
            const errorMsg = error?.message || 'Unknown ingestion error';

            await repo.Update(new ObjectId(id), {
                ingestionStatus: KnowledgeBaseIngestionStatus.FAILED,
                ingestionCompletedAt: failedAt,
                ingestionError: errorMsg,
                ingestionRetryCount: (record.ingestionRetryCount || 0) + 1,
            });

            Logger.Console(`KB ingestion failed: ${id} - ${errorMsg}`, 'error');
            throw error;
        }
    }

    public async setupWorkerEventListeners(worker: Worker, queueName: string): Promise<void> {
        worker.on('completed', async (job: Job) => {
            Logger.Console(`Job completed in queue ${queueName}: ${job.id}`, 'info');
            await job.remove();
        });

        worker.on('failed', async (job: Job, err: Error) => {
            Logger.Console(`Job failed in queue ${queueName}: ${job?.id} with error: ${err.message}`, 'error');
        });

        worker.on('stalled', (job) => {
            Logger.Console(`Job stalled for queue: ${queueName}`, 'warn');
        });
    }
}

export default KnowledgeBaseJobProcessor;
