import { logger } from "@infrastructure/logger";
import { eventBus } from "@infrastructure/events";

const log = logger.child({ component: "queue" });

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "dead";
export type JobPriority = "low" | "normal" | "high" | "critical";

export interface QueueJob<T = unknown> {
    id: string;
    type: string;
    data: T;
    priority: JobPriority;
    status: JobStatus;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    processedAt?: Date;
    completedAt?: Date;
    error?: string;
    result?: unknown;
}

export interface QueueStats {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    dead: number;
}

// Priority weights for ordering
const PRIORITY_WEIGHTS: Record<JobPriority, number> = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
};

/**
 * In-memory queue with retry and dead letter support
 * Can be replaced with Redis/BullMQ for production
 */
export class MemoryQueue<T = unknown> {
    private jobs = new Map<string, QueueJob<T>>();
    private deadLetterQueue = new Map<string, QueueJob<T>>();
    private processing = new Set<string>();
    private isRunning = false;
    private workerInterval: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly name: string,
        private readonly handler: (job: QueueJob<T>) => Promise<unknown>,
        private readonly options: {
            maxAttempts?: number;
            retryDelayMs?: number;
            concurrency?: number;
            pollIntervalMs?: number;
        } = {}
    ) {
        this.options.maxAttempts = options.maxAttempts ?? 3;
        this.options.retryDelayMs = options.retryDelayMs ?? 1000;
        this.options.concurrency = options.concurrency ?? 5;
        this.options.pollIntervalMs = options.pollIntervalMs ?? 100;
    }

    /**
     * Add a job to the queue
     */
    async add(
        type: string,
        data: T,
        options: { priority?: JobPriority; maxAttempts?: number } = {}
    ): Promise<string> {
        const id = crypto.randomUUID();
        const job: QueueJob<T> = {
            id,
            type,
            data,
            priority: options.priority ?? "normal",
            status: "pending",
            attempts: 0,
            maxAttempts: options.maxAttempts ?? this.options.maxAttempts!,
            createdAt: new Date(),
        };

        this.jobs.set(id, job);
        log.debug({ queue: this.name, jobId: id, type }, "Job added to queue");

        return id;
    }

    /**
     * Start processing jobs
     */
    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;

        log.info({ queue: this.name }, "Queue worker started");

        this.workerInterval = setInterval(() => {
            this.processNext();
        }, this.options.pollIntervalMs);
    }

    /**
     * Stop processing
     */
    stop(): void {
        this.isRunning = false;
        if (this.workerInterval) {
            clearInterval(this.workerInterval);
            this.workerInterval = null;
        }
        log.info({ queue: this.name }, "Queue worker stopped");
    }

    /**
     * Process next available job
     */
    private async processNext(): Promise<void> {
        if (this.processing.size >= this.options.concurrency!) return;

        // Get next pending job by priority
        const pendingJobs = Array.from(this.jobs.values())
            .filter((j) => j.status === "pending")
            .sort((a, b) => PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority]);

        const job = pendingJobs[0];
        if (!job) return;

        // Mark as processing
        job.status = "processing";
        job.processedAt = new Date();
        job.attempts++;
        this.processing.add(job.id);

        try {
            const result = await this.handler(job);
            job.status = "completed";
            job.completedAt = new Date();
            job.result = result;

            log.debug({ queue: this.name, jobId: job.id, attempts: job.attempts }, "Job completed");

            // Emit completion event
            eventBus.emit("queue.job.completed" as any, {
                queue: this.name,
                jobId: job.id,
                type: job.type,
            });
        } catch (err: any) {
            job.error = err.message;

            if (job.attempts >= job.maxAttempts) {
                // Move to dead letter queue
                job.status = "dead";
                this.deadLetterQueue.set(job.id, job);
                this.jobs.delete(job.id);

                log.warn(
                    { queue: this.name, jobId: job.id, attempts: job.attempts, error: err.message },
                    "Job moved to dead letter queue"
                );

                eventBus.emit("queue.job.dead" as any, {
                    queue: this.name,
                    jobId: job.id,
                    type: job.type,
                    error: err.message,
                });
            } else {
                // Retry with exponential backoff
                job.status = "pending";
                const delay = this.options.retryDelayMs! * Math.pow(2, job.attempts - 1);

                log.debug(
                    { queue: this.name, jobId: job.id, attempts: job.attempts, nextRetryMs: delay },
                    "Job will retry"
                );
            }
        } finally {
            this.processing.delete(job.id);
        }
    }

    /**
     * Get queue statistics
     */
    getStats(): QueueStats {
        const stats: QueueStats = {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            dead: this.deadLetterQueue.size,
        };

        for (const job of this.jobs.values()) {
            switch (job.status) {
                case "pending":
                    stats.pending++;
                    break;
                case "processing":
                    stats.processing++;
                    break;
                case "completed":
                    stats.completed++;
                    break;
                case "failed":
                    stats.failed++;
                    break;
            }
        }

        return stats;
    }

    /**
     * Get job by ID
     */
    getJob(id: string): QueueJob<T> | null {
        return this.jobs.get(id) || this.deadLetterQueue.get(id) || null;
    }

    /**
     * Get dead letter queue jobs
     */
    getDeadLetterJobs(): QueueJob<T>[] {
        return Array.from(this.deadLetterQueue.values());
    }

    /**
     * Retry a dead letter job
     */
    retryDeadLetter(jobId: string): boolean {
        const job = this.deadLetterQueue.get(jobId);
        if (!job) return false;

        job.status = "pending";
        job.attempts = 0;
        job.error = undefined;
        this.jobs.set(jobId, job);
        this.deadLetterQueue.delete(jobId);

        log.info({ queue: this.name, jobId }, "Dead letter job retried");
        return true;
    }

    /**
     * Clear completed jobs (cleanup)
     */
    clearCompleted(): number {
        let count = 0;
        for (const [id, job] of this.jobs.entries()) {
            if (job.status === "completed") {
                this.jobs.delete(id);
                count++;
            }
        }
        return count;
    }
}
