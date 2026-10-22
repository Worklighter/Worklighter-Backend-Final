import { Logger } from "./logger";

export class Scheduler {
    private intervalId: NodeJS.Timeout | null = null;
    private readonly taskName: string;
    private readonly intervalMs: number;
    private readonly taskFunction: () => Promise<void>;

    /**
     * @param taskName - The name of the scheduled task.
     * @param intervalMs - Interval in milliseconds to run the task.
     * @param taskFunction - The async function to execute periodically.
     */
    constructor(taskName: string, intervalMs: number, taskFunction: () => Promise<void>) {
        this.taskName = taskName;
        this.intervalMs = intervalMs;
        this.taskFunction = taskFunction;
    }

    public start() {
        if (this.intervalId) {
            console.warn(`Scheduler for task "${this.taskName}" is already running.`);
            return;
        }

        Logger.Console(`Starting scheduler for task "${this.taskName}"...`, 'info');
        
        this.intervalId = setInterval(async () => {
            console.log(`Executing task "${this.taskName}"...`);
            try {
                await this.taskFunction();
            } catch (error) {
                console.error(`Error executing task "${this.taskName}":`, error);
            }
            
        }, this.intervalMs);
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log(`Scheduler for task "${this.taskName}" has been stopped.`);
        } else {
            console.warn(`Scheduler for task "${this.taskName}" is not running.`);
        }
    }
}
