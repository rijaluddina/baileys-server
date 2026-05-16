import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async generateKey(tenantId: string, name: string): Promise<string> {
    const key = this.generateSecureKey();
    await this.prisma.apiKey.create({
      data: {
        key,
        tenantId,
        name,
        isActive: true,
      },
    });
    return key;
  }

  async rotateKey(id: string): Promise<string> {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('API key not found');
    }

    await this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    const newKey = this.generateSecureKey();
    await this.prisma.apiKey.create({
      data: {
        key: newKey,
        tenantId: existing.tenantId,
        name: existing.name,
        isActive: true,
      },
    });

    return newKey;
  }

  async deactivateKey(id: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async activateKey(id: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { isActive: true },
    });
  }

  validateKey(key: string): boolean {
    if (!key || typeof key !== 'string') {
      return false;
    }
    const prefix = 'wa_live_';
    if (!key.startsWith(prefix)) {
      return false;
    }
    const suffix = key.slice(prefix.length);
    return suffix.length === 32 && /^[a-zA-Z0-9]+$/.test(suffix);
  }

  private generateSecureKey(): string {
    const prefix = 'wa_live_';
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const randomValues = new Uint32Array(32);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < 32; i++) {
      result += chars[randomValues[i] % chars.length];
    }
    return prefix + result;
  }
}
