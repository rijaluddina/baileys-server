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
}
