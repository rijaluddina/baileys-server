import { Global, Module } from '@nestjs/common';
import { SessionService } from './session.service.js';
import { SessionController } from './session.controller.js';
import { SessionGateway } from './session.gateway.js';

@Global()
@Module({
  providers: [SessionService, SessionGateway],
  controllers: [SessionController],
  exports: [SessionService],
})
export class SessionModule {}
