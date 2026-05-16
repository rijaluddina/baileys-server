import { Module, Global } from '@nestjs/common';
import { TenantContextStore } from './tenant-context.store';

@Global()
@Module({
  providers: [TenantContextStore],
  exports: [TenantContextStore],
})
export class TenantModule {}
