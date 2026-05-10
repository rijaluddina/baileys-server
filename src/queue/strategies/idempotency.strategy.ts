import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface IdempotencyResult {
  isNew: boolean;
  cachedResponse?: unknown;
  cachedStatusCode?: number;
}

export class IdempotencyStrategy {
  private readonly logger = new Logger(IdempotencyStrategy.name);

  constructor(private readonly prisma: PrismaService) {}

  async checkAndSet(
    key: string,
    ttlSeconds = 300,
  ): Promise<{
    exists: boolean;
    entry?: { response: unknown; statusCode: number };
  }> {
    const entry = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (entry) {
      const isExpired = new Date() > entry.expiresAt;
      if (!isExpired && entry.response) {
        return {
          exists: true,
          entry: {
            response: entry.response,
            statusCode: entry.statusCode,
          },
        };
      }
    }

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await this.prisma.idempotencyKey.upsert({
      where: { key },
      create: { key, expiresAt, statusCode: 0 },
      update: { expiresAt, statusCode: 0 },
    });

    return { exists: false };
  }

  async setResponse(
    key: string,
    response: unknown,
    statusCode: number,
    ttlSeconds = 86400,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.idempotencyKey.update({
      where: { key },
      data: {
        response: response as object,
        statusCode,
        expiresAt,
      },
    });
  }

  async isProcessing(key: string): Promise<boolean> {
    const entry = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (!entry) return false;

    const isExpired = new Date() > entry.expiresAt;
    return !isExpired && entry.statusCode === 0 && !entry.response;
  }

  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  }
}
