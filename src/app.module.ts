import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './common/guards/api-key.guard.js';
import { SessionModule } from './session/session.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { GroupModule } from './group/group.module.js';
import { ChatModule } from './chat/chat.module.js';
import { ContactModule } from './contact/contact.module.js';
import { MiscModule } from './misc/misc.module.js';
import { WebhookModule } from './webhook/webhook.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true }),
    SessionModule,
    MessagingModule,
    GroupModule,
    ChatModule,
    ContactModule,
    MiscModule,
    WebhookModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
