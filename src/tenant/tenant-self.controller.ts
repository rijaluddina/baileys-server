import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { TenantService } from './tenant.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';

@ApiTags('Admin')
@ApiSecurity('bearerAuth')
@Controller('tenant')
@UseGuards(AuthGuard)
export class TenantSelfController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current tenant profile' })
  async getSelf(@Req() req: any) {
    return this.tenantService.findById(req.tenant.tenantId);
  }
}
