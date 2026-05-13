import { Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service.js';
import { EventNormalizerService } from './event-normalizer.service.js';
import { EventSequenceService } from './event-sequence.service.js';
import { EventStoreService } from './event-store.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RedisModule } from '../redis/redis.module.js';

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [
    EventBusService,
    EventNormalizerService,
    EventSequenceService,
    EventStoreService,
  ],
  exports: [
    EventBusService,
    EventNormalizerService,
    EventSequenceService,
    EventStoreService,
  ],
})
export class EventModule {}
