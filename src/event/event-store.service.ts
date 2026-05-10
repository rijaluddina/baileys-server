import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface StoreEventOptions {
  sessionId: string;
  eventType: string;
  payload: unknown;
  sequenceNumber?: bigint;
}

@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);
  private sequenceCounters = new Map<string, bigint>();

  constructor(private readonly prisma: PrismaService) {}

  async store(options: StoreEventOptions): Promise<void> {
    try {
      const seqNum = await this.getNextSequence(options.sessionId);

      await this.prisma.sessionEvent.create({
        data: {
          sessionId: options.sessionId,
          eventType: options.eventType,
          payload: options.payload as object,
          sequenceNumber: seqNum,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to store event "${options.eventType}" for session "${options.sessionId}": ${err}`,
      );
    }
  }

  async getEvents(
    sessionId: string,
    options: {
      fromSequence?: bigint;
      limit?: number;
      eventTypes?: string[];
    } = {},
  ): Promise<
    {
      id: string;
      eventType: string;
      payload: unknown;
      sequenceNumber: bigint;
      createdAt: Date;
    }[]
  > {
    const where: Record<string, unknown> = { sessionId };

    if (options.fromSequence !== undefined) {
      where['sequenceNumber'] = { gt: options.fromSequence.toString() };
    }

    if (options.eventTypes?.length) {
      where['eventType'] = { in: options.eventTypes };
    }

    const events = await this.prisma.sessionEvent.findMany({
      where,
      orderBy: { sequenceNumber: 'asc' },
      take: options.limit ?? 100,
    });

    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      payload: e.payload,
      sequenceNumber: e.sequenceNumber,
      createdAt: e.createdAt,
    }));
  }

  async getEventCount(sessionId: string): Promise<number> {
    return this.prisma.sessionEvent.count({ where: { sessionId } });
  }

  async cleanupOldEvents(
    sessionId: string,
    retentionDays: number,
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.sessionEvent.deleteMany({
      where: {
        sessionId,
        createdAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }

  private async getNextSequence(sessionId: string): Promise<bigint> {
    let current = this.sequenceCounters.get(sessionId) ?? BigInt(0);

    const latest = await this.prisma.sessionEvent.findFirst({
      where: { sessionId },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });

    if (latest?.sequenceNumber) {
      current = latest.sequenceNumber;
    }

    current++;
    this.sequenceCounters.set(sessionId, current);
    return current;
  }
}
