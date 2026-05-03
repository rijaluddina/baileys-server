import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller.js';
import { QueueModule } from '../queue/queue.module.js';

@Module({
  imports: [QueueModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
