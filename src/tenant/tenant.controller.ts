import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam } from '@nestjs/swagger';
import { TenantService } from './tenant.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { AdminGuard } from '../admin/guards/admin.guard.js';

@ApiTags('Admin')
@ApiSecurity('x-api-key')
@Controller('admin/tenants')
@UseGuards(AdminGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant' })
  async create(@Body() dto: CreateTenantDto) {
    const tenant = await this.tenantService.create(dto);
    return {
      success: true,
      data: {
        tenant,
        apiKey: tenant.apiKey, // Assuming this exists or is generated
      }
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all tenants (admin only)' })
  async findAll() {
    return this.tenantService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  async findById(@Param('id') id: string) {
    return this.tenantService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  async delete(@Param('id') id: string) {
    return this.tenantService.delete(id);
  }
}
