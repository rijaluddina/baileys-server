import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants.js';

interface WebhookJobData {
  sessionId: string;
  webhookUrl: string;
  event: string;
  data: unknown;
  timestamp: string;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.MESSAGE_STORE)
    private readonly messageStoreQueue: Queue,

    @InjectQueue(QUEUE_NAMES.CONTACT_SYNC)
    private readonly contactSyncQueue: Queue,

    @InjectQueue(QUEUE_NAMES.CHAT_SYNC)
    private readonly chatSyncQueue: Queue,

    @InjectQueue(QUEUE_NAMES.HISTORY_SYNC)
    private readonly historySyncQueue: Queue,

    @InjectQueue(QUEUE_NAMES.WEBHOOK_DELIVERY)
    private readonly webhookDeliveryQueue: Queue<WebhookJobData>,

    @InjectQueue(QUEUE_NAMES.MESSAGE_CLEANUP)
    private readonly messageCleanupQueue: Queue,
  ) {}

  async onModuleDestroy() {
    this.logger.log('Closing all BullMQ queues...');
    await Promise.all([
      this.messageStoreQueue.close(),
      this.contactSyncQueue.close(),
      this.chatSyncQueue.close(),
      this.historySyncQueue.close(),
      this.webhookDeliveryQueue.close(),
      this.messageCleanupQueue.close(),
    ]);
    this.logger.log('All BullMQ queues closed.');
  }

  async addMessageStoreJob(sessionId: string, messages: unknown[]) {
    await this.messageStoreQueue.add(
      'store-messages',
      { sessionId, messages },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  async addContactSyncJob(sessionId: string, contacts: unknown[]) {
    await this.contactSyncQueue.add(
      'sync-contacts',
      { sessionId, contacts },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  async addChatSyncJob(sessionId: string, chats: unknown[]) {
    await this.chatSyncQueue.add(
      'sync-chats',
      { sessionId, chats },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  async addHistorySyncJob(sessionId: string, data: unknown) {
    await this.historySyncQueue.add(
      'sync-history',
      { sessionId, data },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  async addWebhookDeliveryJob(
    sessionId: string,
    webhookUrl: string,
    event: string,
    data: unknown,
  ) {
    await this.webhookDeliveryQueue.add(
      'deliver-webhook',
      {
        sessionId,
        webhookUrl,
        event,
        data,
        timestamp: new Date().toISOString(),
      },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  async getFailedWebhookJobs() {
    const jobs = await this.webhookDeliveryQueue.getFailed();
    return jobs.map((job) => {
      const data = job.data;
      return {
        id: job.id,
        sessionId: data.sessionId,
        event: data.event,
        webhookUrl: data.webhookUrl,
        failedReason: job.failedReason,
        timestamp: data.timestamp,
        attemptsMade: job.attemptsMade,
      };
    });
  }

  async replayWebhookJob(jobId: string) {
    const job = await this.webhookDeliveryQueue.getJob(jobId);
    if (job) {
      await job.retry();
      return true;
    }
    return false;
  }

  async replayAllFailedWebhookJobs() {
    const failedJobs = await this.webhookDeliveryQueue.getFailed();
    for (const job of failedJobs) {
      await job.retry();
    }
    return failedJobs.length;
  }

  async scheduleMessageCleanup() {
    // Remove existing repeatable job with same key before adding
    const existingJobs = await this.messageCleanupQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      if (job.name === 'cleanup-old-messages') {
        await this.messageCleanupQueue.removeRepeatableByKey(job.key);
      }
    }

    await this.messageCleanupQueue.add(
      'cleanup-old-messages',
      {},
      {
        repeat: {
          // Run daily at 3 AM
          pattern: '0 3 * * *',
        },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.logger.log('Scheduled daily message cleanup job (3:00 AM)');
  }

  async getQueueMetrics() {
    const getCounts = async (queue: Queue) => {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);
      return { waiting, active, completed, failed };
    };

    const [messageStore, contactSync, chatSync, historySync, webhookDelivery, messageCleanup] =
      await Promise.all([
        getCounts(this.messageStoreQueue),
        getCounts(this.contactSyncQueue),
        getCounts(this.chatSyncQueue),
        getCounts(this.historySyncQueue),
        getCounts(this.webhookDeliveryQueue),
        getCounts(this.messageCleanupQueue),
      ]);

    return {
      messageStore,
      contactSync,
      chatSync,
      historySync,
      webhookDelivery,
      messageCleanup,
    };
  }
}
