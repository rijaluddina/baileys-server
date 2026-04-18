import { Module } from '@nestjs/common';
import { WebhookService } from './webhook.service.js';

@Module({
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
