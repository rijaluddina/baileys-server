import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants.js';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.MESSAGE_STORE)
    private readonly messageStoreQueue: Queue,

    @InjectQueue(QUEUE_NAMES.CONTACT_SYNC)
    private readonly contactSyncQueue: Queue,

    @InjectQueue(QUEUE_NAMES.CHAT_SYNC)
    private readonly chatSyncQueue: Queue,

    @InjectQueue(QUEUE_NAMES.WEBHOOK_DELIVERY)
    private readonly webhookDeliveryQueue: Queue,

    @InjectQueue(QUEUE_NAMES.MESSAGE_CLEANUP)
    private readonly messageCleanupQueue: Queue,
  ) {}

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

  async addWebhookDeliveryJob(
    sessionId: string,
    webhookUrl: string,
    event: string,
    data: unknown,
  ) {
    await this.webhookDeliveryQueue.add(
      'deliver-webhook',
      { sessionId, webhookUrl, event, data, timestamp: new Date().toISOString() },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
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
}
