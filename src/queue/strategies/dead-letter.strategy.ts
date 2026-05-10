import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface DeadLetterEntry {
  queueName: string;
  jobId: string | number;
  jobName: string;
  data: unknown;
  failedReason: string;
  failedAttempts: number;
  failedAt: Date;
  action: 'retry' | 'discard' | 'manual';
}

export class DeadLetterStrategy {
  private readonly logger = new Logger(DeadLetterStrategy.name);

  async moveToDeadLetter(
    queue: Queue,
    jobId: string | number,
    failedReason: string,
    maxRetries: number,
  ): Promise<void> {
    const job = await queue.getJob(String(jobId));
    if (!job) return;

    if (job.attemptsMade >= maxRetries) {
      this.logger.warn(
        `Job ${jobId} exceeded max retries (${maxRetries}), moving to DLQ`,
      );

      const dlqName = `${queue.name}:dlq`;
      const client = await queue.client;
      await client.lpush(
        dlqName,
        JSON.stringify({
          queueName: queue.name,
          jobId: job.id,
          jobName: job.name,
          data: job.data as object,
          failedReason: failedReason ?? 'Unknown error',
          failedAttempts: job.attemptsMade,
          failedAt: new Date().toISOString(),
        }),
      );

      await job.remove();
      this.logger.log(`Moved job ${jobId} to DLQ: ${dlqName}`);
    }
  }

  async getDeadLetterEntries(
    queue: Queue,
    limit = 50,
  ): Promise<DeadLetterEntry[]> {
    const dlqName = `${queue.name}:dlq`;
    const client = await queue.client;
    const entries = await client.lrange(dlqName, 0, limit - 1);

    return entries.map((entry: string) => {
      try {
        return JSON.parse(entry) as DeadLetterEntry;
      } catch {
        return {
          queueName: queue.name,
          jobId: 'unknown',
          jobName: 'unknown',
          data: entry,
          failedReason: 'Parse error',
          failedAttempts: 0,
          failedAt: new Date(),
          action: 'discard' as const,
        };
      }
    });
  }

  async retryDeadLetter(queue: Queue, jobId: string | number): Promise<void> {
    const dlqName = `${queue.name}:dlq`;
    const client = await queue.client;
    const entries = await client.lrange(dlqName, 0, -1);

    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry) as DeadLetterEntry;
        if (parsed.jobId === jobId || jobId === 'all') {
          await queue.add(parsed.jobName, parsed.data, {
            attempts: 1,
            removeOnComplete: true,
          });

          await client.lrem(dlqName, 1, entry);
          this.logger.log(`Retried DLQ job: ${parsed.jobId}`);
        }
      } catch {
        continue;
      }
    }
  }

  async discardDeadLetter(queue: Queue, jobId: string | number): Promise<void> {
    const dlqName = `${queue.name}:dlq`;
    const client = await queue.client;
    const entries = await client.lrange(dlqName, 0, -1);

    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry) as DeadLetterEntry;
        if (parsed.jobId === jobId || jobId === 'all') {
          await client.lrem(dlqName, 1, entry);
          this.logger.log(`Discarded DLQ job: ${parsed.jobId}`);
        }
      } catch {
        continue;
      }
    }
  }
}
