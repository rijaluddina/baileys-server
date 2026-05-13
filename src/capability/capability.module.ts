import { Global, Module } from '@nestjs/common';
import { CapabilityService } from './capability.service.js';
import { CapabilityGuard } from './capability.guard.js';
import { CapabilityController } from './capability.controller.js';

@Global()
@Module({
  controllers: [CapabilityController],
  providers: [CapabilityService, CapabilityGuard],
  exports: [CapabilityService, CapabilityGuard],
})
export class CapabilityModule {}