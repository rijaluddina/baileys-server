import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextStore } from '../common/tenant/tenant-context.store.js';

export interface ValidatedTenant {
  tenantId: string;
  tenantName: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateApiKey(apiKey: string): Promise<ValidatedTenant> {
    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { apiKey },
      select: { id: true, name: true, active: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (!tenant.active) {
      throw new UnauthorizedException('Tenant is inactive');
    }

    TenantContextStore.set({
      tenantId: tenant.id,
    });

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
    };
  }

  async validateApiKeyWithoutContext(
    apiKey: string,
  ): Promise<ValidatedTenant | null> {
    if (!apiKey) {
      return null;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { apiKey },
      select: { id: true, name: true, active: true },
    });

    if (!tenant || !tenant.active) {
      return null;
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
    };
  }
}
