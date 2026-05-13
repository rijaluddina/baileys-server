import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import { ConfigService } from '@nestjs/config';

export interface RateLimitResult {
  allowed: boolean;
  waitMs: number;
  reason: string | null;
}

@Injectable()
export class WaRateLimiterService {
  private readonly logger = new Logger(WaRateLimiterService.name);

  private readonly minDelayMs: number;
  private readonly burstLimit: number;
  private readonly burstWindowMs: number;
  private readonly sustainedLimit: number;
  private readonly sustainedWindowMs: number;
  private readonly keyPrefix: string;

  private readonly lastSentTime: Map<string, number> = new Map();

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.minDelayMs =
      this.configService.get<number>('ratelimit.minDelayMs') ?? 500;
    this.burstLimit =
      this.configService.get<number>('ratelimit.burstLimit') ?? 10;
    this.burstWindowMs =
      this.configService.get<number>('ratelimit.burstWindowMs') ?? 10000;
    this.sustainedLimit =
      this.configService.get<number>('ratelimit.sustainedLimit') ?? 60;
    this.sustainedWindowMs =
      this.configService.get<number>('ratelimit.sustainedWindowMs') ?? 60000;
    this.keyPrefix =
      this.configService.get<string>('redis.keyPrefix') ?? 'baileys:';
  }

  async checkLimit(sessionId: string): Promise<RateLimitResult> {
    const now = Date.now();

    const lastSent = this.lastSentTime.get(sessionId) ?? 0;
    const timeSinceLastSent = now - lastSent;

    if (timeSinceLastSent < this.minDelayMs) {
      const waitMs = this.minDelayMs - timeSinceLastSent;
      return {
        allowed: false,
        waitMs,
        reason: `min_delay: wait ${waitMs}ms between messages`,
      };
    }

    const burstCount = await this.getCount(
      sessionId,
      'burst',
      now,
      this.burstWindowMs,
    );
    if (burstCount >= this.burstLimit) {
      const waitMs = await this.getWindowResetTime(
        sessionId,
        'burst',
        now,
        this.burstWindowMs,
      );
      return {
        allowed: false,
        waitMs,
        reason: `burst_limit: ${burstCount}/${this.burstLimit} in ${this.burstWindowMs / 1000}s`,
      };
    }

    const sustainedCount = await this.getCount(
      sessionId,
      'sustained',
      now,
      this.sustainedWindowMs,
    );
    if (sustainedCount >= this.sustainedLimit) {
      const waitMs = await this.getWindowResetTime(
        sessionId,
        'sustained',
        now,
        this.sustainedWindowMs,
      );
      return {
        allowed: false,
        waitMs,
        reason: `sustained_limit: ${sustainedCount}/${this.sustainedLimit} in ${this.sustainedWindowMs / 1000}s`,
      };
    }

    return { allowed: true, waitMs: 0, reason: null };
  }

  async recordSent(sessionId: string): Promise<void> {
    const now = Date.now();
    this.lastSentTime.set(sessionId, now);

    await Promise.all([
      this.addToWindow(sessionId, 'burst', now),
      this.addToWindow(sessionId, 'sustained', now),
    ]);
  }

  private async getCount(
    sessionId: string,
    window: string,
    now: number,
    windowMs: number,
  ): Promise<number> {
    const key = `${this.keyPrefix}ratelimit:${sessionId}:${window}`;
    const windowStart = now - windowMs;

    try {
      const client = this.redisService.getClient();
      const count = await client.zcount(key, windowStart, now);
      return count;
    } catch (err) {
      this.logger.error(`Redis error getting count for ${key}: ${err}`);
      return 0;
    }
  }

  private async getWindowResetTime(
    sessionId: string,
    window: string,
    now: number,
    windowMs: number,
  ): Promise<number> {
    const key = `${this.keyPrefix}ratelimit:${sessionId}:${window}`;
    const windowStart = now - windowMs;

    try {
      const client = this.redisService.getClient();
      const oldest = await client.zrange(key, 0, 0, 'WITHSCORES');
      if (oldest && oldest.length >= 2) {
        const oldestTimestamp = parseInt(oldest[1], 10);
        const resetAt = oldestTimestamp + windowMs;
        return Math.max(0, resetAt - now);
      }
    } catch (err) {
      this.logger.error(`Redis error getting window reset for ${key}: ${err}`);
    }

    return windowMs;
  }

  private async addToWindow(
    sessionId: string,
    window: string,
    timestamp: number,
  ): Promise<void> {
    const key = `${this.keyPrefix}ratelimit:${sessionId}:${window}`;
    const windowMs = window === 'burst' ? this.burstWindowMs : this.sustainedWindowMs;

    try {
      const client = this.redisService.getClient();
      const pipeline = client.pipeline();
      pipeline.zadd(key, timestamp, `${timestamp}:${Math.random()}`);
      pipeline.expire(key, Math.ceil(windowMs / 1000) + 1);
      await pipeline.exec();
    } catch (err) {
      this.logger.error(`Redis error adding to window ${key}: ${err}`);
    }
  }

  async clearLimits(sessionId: string): Promise<void> {
    this.lastSentTime.delete(sessionId);

    const keys = [
      `${this.keyPrefix}ratelimit:${sessionId}:burst`,
      `${this.keyPrefix}ratelimit:${sessionId}:sustained`,
    ];

    try {
      const client = this.redisService.getClient();
      await client.del(...keys);
    } catch (err) {
      this.logger.error(`Redis error clearing limits for ${sessionId}: ${err}`);
    }
  }
}