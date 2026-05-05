import { Global, Module } from '@nestjs/common';
import { SessionService } from './session.service.js';
import { SessionDataService } from './session-data.service.js';
import { SessionController } from './session.controller.js';
import { SessionGateway } from './session.gateway.js';

@Global()
@Module({
  providers: [SessionService, SessionDataService, SessionGateway],
  controllers: [SessionController],
  exports: [SessionService, SessionDataService],
})
export class SessionModule {}
