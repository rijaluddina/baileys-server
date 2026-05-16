import { Global, Module } from '@nestjs/common';
import { SessionService } from './session.service.js';
import { SessionDataService } from './session-data.service.js';
import { SessionController } from './session.controller.js';
import { SessionGateway } from './session.gateway.js';
import { WaRateLimiterService } from './wa-rate-limiter.service.js';

@Global()
@Module({
  providers: [
    SessionService,
    SessionDataService,
    SessionGateway,
    WaRateLimiterService,
  ],
  controllers: [SessionController],
  exports: [SessionService, SessionDataService, WaRateLimiterService],
})
export class SessionModule {}
