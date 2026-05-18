import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessageStoreProcessor } from './processors/message-store.processor.js';
import { ContactSyncProcessor } from './processors/contact-sync.processor.js';
import { ChatSyncProcessor } from './processors/chat-sync.processor.js';
import { HistorySyncProcessor } from './processors/history-sync.processor.js';
import { WebhookDeliveryProcessor } from './processors/webhook-delivery.processor.js';
import { MessageCleanupProcessor } from './processors/message-cleanup.processor.js';
import { QueueService } from './queue.service.js';
import { MessageProducer } from './producers/message.producer.js';
import { MediaProducer } from './producers/media.producer.js';
import { GroupProducer } from './producers/group.producer.js';
import { WebhookProducer } from './producers/webhook.producer.js';
import { IdempotencyStrategy } from './strategies/idempotency.strategy.js';

import { QUEUE_NAMES } from './queue.constants.js';

type RedisConnectionConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
};

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        let connection: RedisConnectionConfig = {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        };

        if (redisUrl) {
          try {
            const parsed = new URL(redisUrl);
            connection = {
              host: parsed.hostname,
              port: parseInt(parsed.port, 10) || 6379,
              username: parsed.username || undefined,
              password: parsed.password || undefined,
            };
          } catch {
            // Fallback to defaults if URL is invalid
          }
        }

        return {
          connection,
          defaultJobOptions: {
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.MESSAGE_STORE },
      { name: QUEUE_NAMES.CONTACT_SYNC },
      { name: QUEUE_NAMES.CHAT_SYNC },
      { name: QUEUE_NAMES.HISTORY_SYNC },
      { name: QUEUE_NAMES.WEBHOOK_DELIVERY },
      { name: QUEUE_NAMES.MESSAGE_CLEANUP },
      { name: QUEUE_NAMES.MESSAGE_SEND },
      { name: QUEUE_NAMES.MESSAGE_EDIT },
      { name: QUEUE_NAMES.MESSAGE_DELETE },
      { name: QUEUE_NAMES.MEDIA_UPLOAD },
      { name: QUEUE_NAMES.MEDIA_DOWNLOAD },
      { name: QUEUE_NAMES.GROUP_ACTION },
      { name: QUEUE_NAMES.WEBHOOK_DELIVER },
      { name: QUEUE_NAMES.SESSION_INIT },
    ),
  ],
  providers: [
    QueueService,
    MessageStoreProcessor,
    ContactSyncProcessor,
    ChatSyncProcessor,
    HistorySyncProcessor,
    WebhookDeliveryProcessor,
    MessageCleanupProcessor,
    MessageProducer,
    MediaProducer,
    GroupProducer,
    WebhookProducer,
    IdempotencyStrategy,
  ],
  exports: [
    QueueService,
    BullModule,
    MessageProducer,
    MediaProducer,
    GroupProducer,
    WebhookProducer,
    IdempotencyStrategy,
  ],
})
export class QueueModule {}
