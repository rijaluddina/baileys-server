import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminGuard } from './guards/admin.guard.js';
import { Public } from '../common/decorators/public.decorator.js';

@Controller('admin')
@UseGuards(AdminGuard)
@Public()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}


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
