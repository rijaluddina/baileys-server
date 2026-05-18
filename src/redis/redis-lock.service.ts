import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service.js';
import { ConfigService } from '@nestjs/config';

export interface LockOptions {
  ttlMs: number;
  retryCount?: number;
  retryDelayMs?: number;
}

export interface Lock {
  key: string;
  token: string;
  release: () => Promise<boolean>;
}

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly defaultTtlMs: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTtlMs =
      this.configService.get<number>('app.session.lockTtl') ?? 30000;
    this.keyPrefix =
      this.configService.get<string>('redis.keyPrefix') ?? 'baileys:';
  }

  async acquireLock(
    resourceId: string,
    options: Partial<LockOptions> = {},
  ): Promise<Lock | null> {
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;
    const retryCount = options.retryCount ?? 3;
    const retryDelayMs = options.retryDelayMs ?? 500;

    const key = `${this.keyPrefix}lock:${resourceId}`;
    const token = this.generateToken();

    for (let attempt = 0; attempt < retryCount; attempt++) {
      const acquired = await this.redisService.setNX(key, token, ttlMs);

      if (acquired) {
        return {
          key,
          token,
          release: () => this.releaseLock(key, token),
        };
      }

      if (attempt < retryCount - 1) {
        await this.sleep(retryDelayMs * (attempt + 1));
      }
    }

    this.logger.warn(
      `Failed to acquire lock for resource: ${resourceId} after ${retryCount} attempts`,
    );
    return null;
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const client = this.redisService.getClient();
      const result = await client.eval(script, 1, key, token);
      return result === 1;
    } catch (err) {
      this.logger.error(`Failed to release lock ${key}: ${err}`);
      return false;
    }
  }

  async extendLock(
    key: string,
    token: string,
    ttlMs: number,
  ): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const client = this.redisService.getClient();
      const result = await client.eval(script, 1, key, token, ttlMs.toString());
      return result === 1;
    } catch (err) {
      this.logger.error(`Failed to extend lock ${key}: ${err}`);
      return false;
    }
  }

  async isLocked(resourceId: string): Promise<boolean> {
    const key = `${this.keyPrefix}lock:${resourceId}`;
    try {
      return await this.redisService.exists(key);
    } catch {
      return false;
    }
  }

  async getLockOwner(resourceId: string): Promise<string | null> {
    const key = `${this.keyPrefix}lock:${resourceId}`;
    try {
      return await this.redisService.get(key);
    } catch {
      return null;
    }
  }

  private generateToken(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2);
    return `${timestamp}:${random}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
