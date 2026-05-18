import {
  Global,
  Module,
  OnModuleDestroy,
  Logger,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';

@Injectable()
class RedisServiceClass {
  private readonly logger = new Logger(RedisServiceClass.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {
    const url =
      this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';

    const options: RedisOptions = {
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 3,
    };

    const password = this.configService.get<string>('REDIS_PASSWORD');
    const username = this.configService.get<string>('REDIS_USERNAME');

    if (password) {
      options.password = password;
    }
    if (username) {
      options.username = username;
    }

    this.client = new Redis(url, options);

    this.client.on('connect', () => this.logger.log('Connected to Redis'));
    this.client.on('error', (err: Error) =>
      this.logger.error(`Redis error: ${err}`),
    );
    this.client.on('close', () => this.logger.warn('Redis connection closed'));
  }

  getClient(): Redis {
    return this.client;
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async setNX(key: string, value: string, ttlMs: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  async subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<void> {
    const subscriber = this.client.duplicate();
    await subscriber.subscribe(channel);
    subscriber.on('message', (ch: string, msg: string) => {
      if (ch === channel) callback(msg);
    });
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.client.hdel(key, field);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }
}

export { RedisServiceClass as RedisService };

@Global()
@Module({
  providers: [RedisServiceClass],
  exports: [RedisServiceClass],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(private readonly redisService: RedisServiceClass) {}

  async onModuleDestroy(): Promise<void> {
    await this.redisService.disconnect();
  }
}
