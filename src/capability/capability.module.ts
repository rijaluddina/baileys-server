import { Global, Module } from '@nestjs/common';
import { CapabilityService } from './capability.service.js';
import { CapabilityGuard } from './capability.guard.js';

@Global()
@Module({
  providers: [CapabilityService, CapabilityGuard],
  exports: [CapabilityService, CapabilityGuard],
})
export class CapabilityModule {}