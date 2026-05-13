import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiKeyGuard } from './common/guards/api-key.guard.js';
import { SessionThrottlerGuard } from './common/guards/session-throttler.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { SessionModule } from './session/session.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { GroupModule } from './group/group.module.js';
import { ChatModule } from './chat/chat.module.js';
import { ContactModule } from './contact/contact.module.js';
import { MiscModule } from './misc/misc.module.js';
import { HealthModule } from './health/health.module.js';
import { WebhookModule } from './webhook/webhook.module.js';
import { RedisCacheModule } from './common/redis-cache.module.js';
import { RedisModule } from './redis/redis.module.js';
import { EventModule } from './event/event.module.js';
import { BaileysExceptionFilter } from './common/filters/baileys-exception.filter.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisCacheModule,
    RedisModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 120),
      },
    ]),
    EventEmitterModule.forRoot({ wildcard: true }),
    PrismaModule,
    AuthModule,
    QueueModule,
    SessionModule,
    MessagingModule,
    GroupModule,
    ChatModule,
    ContactModule,
    MiscModule,
    HealthModule,
    WebhookModule,
    EventModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SessionThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_FILTER,
      useClass: BaileysExceptionFilter,
    },
  ],
})
export class AppModule {}
