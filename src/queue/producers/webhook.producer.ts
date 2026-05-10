import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants.js';

interface WebhookJobData {
  webhookId: string;
  sessionId: string;
  event: string;
  payload: Record<string, unknown>;
  url: string;
  secret?: string;
  headers?: Record<string, string>;
  attempt: number;
  correlationId: string;
  createdAt: string;
}

@Injectable()
export class WebhookProducer {
  private readonly logger = new Logger(WebhookProducer.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.WEBHOOK_DELIVER)
    private readonly webhookQueue: Queue<WebhookJobData>,
  ) {}

  async deliver(
    webhookId: string,
    sessionId: string,
    event: string,
    payload: Record<string, unknown>,
    url: string,
    options: {
      secret?: string;
      headers?: Record<string, string>;
      correlationId?: string;
    } = {},
  ) {
    const jobData: WebhookJobData = {
      webhookId,
      sessionId,
      event,
      payload,
      url,
      secret: options.secret,
      headers: options.headers,
      attempt: 0,
      correlationId: options.correlationId ?? '',
      createdAt: new Date().toISOString(),
    };

    await this.webhookQueue.add(
      `webhook-${event}-${sessionId}-${Date.now()}`,
      jobData,
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.debug(`Queued webhook delivery: ${event} to ${url}`);
    return { webhookId, sessionId, event, url };
  }

  async retryFailed(webhookJobId: string) {
    const job = await this.webhookQueue.getJob(webhookJobId);
    if (job) {
      await job.retry();
      return true;
    }
    return false;
  }

  async retryAllFailed() {
    const failedJobs = await this.webhookQueue.getFailed();
    for (const job of failedJobs) {
      await job.retry();
    }
    return failedJobs.length;
  }
}
