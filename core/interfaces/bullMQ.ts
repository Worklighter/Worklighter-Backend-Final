import { Worker } from "bullmq";
export interface BullMQ {
    initQueues(): Promise<void>
    initWorkers(queueName: string): Promise<void>
    setupWorkerEventListeners(worker: Worker, queueName: string): Promise<void>
}