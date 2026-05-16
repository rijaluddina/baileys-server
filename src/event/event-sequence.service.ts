import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class EventSequenceService {
  private readonly logger = new Logger(EventSequenceService.name);
  private readonly sequences = new Map<string, bigint>();
  private static readonly REDIS_KEY_PREFIX = 'event:sequence:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async initializeForSession(sessionId: string): Promise<bigint> {
    const lastEvent = await this.prisma.sessionEvent.findFirst({
      where: { sessionId },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });

    const lastSequence = lastEvent?.sequenceNumber ?? 0n;
    this.sequences.set(sessionId, lastSequence);

    await this.syncToRedis(sessionId, lastSequence);

    this.logger.debug(
      `Initialized session ${sessionId} with sequence ${lastSequence}`,
    );
    return lastSequence;
  }

  async next(sessionId: string): Promise<bigint> {
    let current = this.sequences.get(sessionId);

    if (current === undefined) {
      current = await this.initializeForSession(sessionId);
    }

    const nextSequence = ++current;
    this.sequences.set(sessionId, nextSequence);

    await this.syncToRedis(sessionId, nextSequence);

    return nextSequence;
  }

  async release(sessionId: string): Promise<void> {
    this.sequences.delete(sessionId);
    await this.redis.del(
      `${EventSequenceService.REDIS_KEY_PREFIX}${sessionId}`,
    );
    this.logger.debug(`Released sequence for session ${sessionId}`);
  }

  private async syncToRedis(
    sessionId: string,
    sequence: bigint,
  ): Promise<void> {
    try {
      const key = `${EventSequenceService.REDIS_KEY_PREFIX}${sessionId}`;
      await this.redis.set(key, sequence.toString());
    } catch (error) {
      this.logger.warn(
        `Failed to sync sequence to Redis for session ${sessionId}: ${error}`,
      );
    }
  }

  async getCurrentSequence(sessionId: string): Promise<bigint | undefined> {
    return this.sequences.get(sessionId);
  }

  async getFromRedis(sessionId: string): Promise<bigint | null> {
    try {
      const value = await this.redis.get(
        `${EventSequenceService.REDIS_KEY_PREFIX}${sessionId}`,
      );
      return value ? BigInt(value) : null;
    } catch {
      return null;
    }
  }
}
