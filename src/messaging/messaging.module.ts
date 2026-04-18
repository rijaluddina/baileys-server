import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service.js';
import { MessagingController } from './messaging.controller.js';

@Module({
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
