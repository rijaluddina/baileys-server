import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller.js';

@Module({
  controllers: [WebhookController],
})
export class WebhookModule {}
