import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminGuard } from './guards/admin.guard.js';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('tenants')
  async getAllTenants() {
    return this.adminService.getAllTenants();
  }

  @Get('sessions')
  async getAllSessions(@Query('tenantId') tenantId?: string) {
    return this.adminService.getAllSessions(tenantId);
  }

  @Get('metrics')
  async getMetrics() {
    const system = this.adminService.getSystemMetrics();
    const queue = await this.adminService.getQueueMetrics();
    return { system, queue };
  }
}
