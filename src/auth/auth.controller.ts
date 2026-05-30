import {
  Controller,
  Get,
  Post,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam } from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextStore } from '../common/tenant/tenant-context.store.js';

@ApiTags('Auth')
@ApiSecurity('x-api-key')
@Controller('auth/keys')
export class AuthController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all API keys for current tenant' })
  async listKeys() {
    const ctx = TenantContextStore.get();
    if (!ctx?.tenantId) {
      throw new NotFoundException('Tenant context not set');
    }

    return this.prisma.apiKey.findMany({
      where: { tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
      },
    });
  }

  @Post('rotate/:id')
  @ApiOperation({ summary: 'Rotate an API key' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  async rotateKey(@Param('id') id: string) {
    return this.apiKeyService.rotateKey(id);
  }

  @Post('deactivate/:id')
  @ApiOperation({ summary: 'Deactivate an API key' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  async deactivateKey(@Param('id') id: string) {
    return this.apiKeyService.deactivateKey(id);
  }

  @Post('activate/:id')
  @ApiOperation({ summary: 'Activate a deactivated API key' })
  @ApiParam({ name: 'id', description: 'API Key ID' })
  async activateKey(@Param('id') id: string) {
    return this.apiKeyService.activateKey(id);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password to get JWT' })
  async login(@Body() body: any) {
    throw new NotFoundException('JWT Authentication is planned and requires User schema.');
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh JWT token' })
  async refresh(@Body() body: any) {
    throw new NotFoundException('JWT Authentication is planned.');
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(@Body() body: any) {
    throw new NotFoundException('JWT Authentication is planned.');
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAll() {
    throw new NotFoundException('JWT Authentication is planned.');
  }
}
