import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service.js';
import { TenantController } from './tenant.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

import { TenantSelfController } from './tenant-self.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [TenantController, TenantSelfController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
