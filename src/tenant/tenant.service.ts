import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { randomBytes } from 'crypto';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant "${id}" not found`);
    }
    return tenant;
  }

  async findByApiKey(apiKey: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { apiKey },
    });
    return tenant;
  }

  async create(data: CreateTenantDto) {
    const apiKey = this.generateApiKey();

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        apiKey,
        webhookUrl: data.webhookUrl,
        maxSessions: data.maxSessions ?? 1,
      },
    });

    return tenant;
  }

  async update(id: string, data: UpdateTenantDto) {
    await this.findById(id);

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.webhookUrl !== undefined && { webhookUrl: data.webhookUrl }),
        ...(data.maxSessions !== undefined && { maxSessions: data.maxSessions }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });

    return tenant;
  }

  async findAll() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return tenants;
  }

  async delete(id: string) {
    await this.findById(id);

    await this.prisma.tenant.delete({
      where: { id },
    });

    return { id, status: 'deleted' };
  }

  private generateApiKey(): string {
    return `tsk_${randomBytes(32).toString('hex')}`;
  }
}