import { Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service.js';
import { EventNormalizerService } from './event-normalizer.service.js';
import { EventStoreService } from './event-store.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [EventBusService, EventNormalizerService, EventStoreService],
  exports: [EventBusService, EventNormalizerService, EventStoreService],
})
export class EventModule {}
