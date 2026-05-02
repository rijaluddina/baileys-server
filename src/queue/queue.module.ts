import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessageStoreProcessor } from './processors/message-store.processor.js';
import { ContactSyncProcessor } from './processors/contact-sync.processor.js';
import { ChatSyncProcessor } from './processors/chat-sync.processor.js';
import { WebhookDeliveryProcessor } from './processors/webhook-delivery.processor.js';
import { MessageCleanupProcessor } from './processors/message-cleanup.processor.js';
import { QueueService } from './queue.service.js';

import { QUEUE_NAMES } from './queue.constants.js';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
        defaultJobOptions: {
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.MESSAGE_STORE },
      { name: QUEUE_NAMES.CONTACT_SYNC },
      { name: QUEUE_NAMES.CHAT_SYNC },
      { name: QUEUE_NAMES.WEBHOOK_DELIVERY },
      { name: QUEUE_NAMES.MESSAGE_CLEANUP },
    ),
  ],
  providers: [
    QueueService,
    MessageStoreProcessor,
    ContactSyncProcessor,
    ChatSyncProcessor,
    WebhookDeliveryProcessor,
    MessageCleanupProcessor,
  ],
  exports: [QueueService, BullModule],
})
export class QueueModule { }
