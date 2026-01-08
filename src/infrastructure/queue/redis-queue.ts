import { Queue, Worker, Job, QueueEvents, type ConnectionOptions } from "bullmq";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "queue" });

// Redis connection options for BullMQ
const redisConnection: ConnectionOptions = {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB) || 0,
};

export type JobPriority = 1 | 2 | 3 | 4; // 1 = highest priority

export interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}

/**
 * Redis-based queue using BullMQ
 */
export class RedisQueue<T extends object = object> {
    private queue: Queue<T, unknown, string>;
    private worker: Worker<T> | null = null;
    private queueEvents: QueueEvents | null = null;

    constructor(
        private readonly name: string,
        private readonly options: {
            defaultJobOptions?: {
                attempts?: number;
                backoff?: { type: "exponential" | "fixed"; delay: number };
                removeOnComplete?: boolean | number;
                removeOnFail?: boolean | number;
            };
        } = {}
    ) {
        this.queue = new Queue<T, unknown, string>(name, {
            connection: redisConnection,
            defaultJobOptions: {
                attempts: options.defaultJobOptions?.attempts ?? 3,
                backoff: options.defaultJobOptions?.backoff ?? {
                    type: "exponential",
                    delay: 2000,
                },
                removeOnComplete: options.defaultJobOptions?.removeOnComplete ?? 100,
                removeOnFail: options.defaultJobOptions?.removeOnFail ?? 500,
            },
        });

        log.info({ queue: name }, "Queue created");
    }

    /**
     * Add a job to the queue
     */
    async add(
        jobName: string,
        data: T,
        options: {
            priority?: JobPriority;
            delay?: number;
            jobId?: string;
        } = {}
    ): Promise<string> {
        const job = await this.queue.add(jobName as any, data as any, {
            priority: options.priority,
            delay: options.delay,
            jobId: options.jobId,
        });

        log.debug({ queue: this.name, jobId: job.id, jobName }, "Job added");
        return job.id!;
    }

    /**
     * Start processing jobs
     */
    startWorker(
        processor: (job: Job<T>) => Promise<unknown>,
        options: { concurrency?: number } = {}
    ): void {
        if (this.worker) {
            log.warn({ queue: this.name }, "Worker already running");
            return;
        }

        this.worker = new Worker<T>(
            this.name,
            async (job) => {
                log.debug({ queue: this.name, jobId: job.id, attempt: job.attemptsMade + 1 }, "Processing job");
                return processor(job);
            },
            {
                connection: redisConnection,
                concurrency: options.concurrency ?? 5,
            }
        );

        this.worker.on("completed", (job) => {
            log.debug({ queue: this.name, jobId: job.id }, "Job completed");
        });

        this.worker.on("failed", (job, err) => {
            log.warn(
                { queue: this.name, jobId: job?.id, error: err.message, attempts: job?.attemptsMade },
                "Job failed"
            );
        });

        this.worker.on("error", (err) => {
            log.error({ queue: this.name, err }, "Worker error");
        });

        // Queue events for monitoring
        this.queueEvents = new QueueEvents(this.name, {
            connection: redisConnection,
        });

        log.info({ queue: this.name, concurrency: options.concurrency ?? 5 }, "Worker started");
    }

    /**
     * Stop the worker
     */
    async stopWorker(): Promise<void> {
        if (this.worker) {
            await this.worker.close();
            this.worker = null;
        }
        if (this.queueEvents) {
            await this.queueEvents.close();
            this.queueEvents = null;
        }
        log.info({ queue: this.name }, "Worker stopped");
    }

    /**
     * Get queue statistics
     */
    async getStats(): Promise<QueueStats> {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            this.queue.getWaitingCount(),
            this.queue.getActiveCount(),
            this.queue.getCompletedCount(),
            this.queue.getFailedCount(),
            this.queue.getDelayedCount(),
        ]);

        return { waiting, active, completed, failed, delayed };
    }

    /**
     * Get failed jobs
     */
    async getFailedJobs(start = 0, end = 20): Promise<Job<T>[]> {
        return this.queue.getFailed(start, end);
    }

    /**
     * Retry a failed job
     */
    async retryJob(jobId: string): Promise<void> {
        const job = await this.queue.getJob(jobId);
        if (job) {
            await job.retry();
            log.info({ queue: this.name, jobId }, "Job retried");
        }
    }

    /**
     * Get job by ID
     */
    async getJob(jobId: string): Promise<Job<T> | undefined> {
        return this.queue.getJob(jobId);
    }

    /**
     * Clean old jobs
     */
    async clean(grace: number, limit: number, type: "completed" | "failed" = "completed"): Promise<string[]> {
        return this.queue.clean(grace, limit, type);
    }

    /**
     * Close queue
     */
    async close(): Promise<void> {
        await this.stopWorker();
        await this.queue.close();
        log.info({ queue: this.name }, "Queue closed");
    }
}
