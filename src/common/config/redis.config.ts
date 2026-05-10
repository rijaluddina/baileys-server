import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'baileys:',
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES ?? '3', 10),
  enableReadyCheck: true,
  lazyConnect: false,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  cacheTtl: parseInt(process.env.REDIS_CACHE_TTL ?? '300000', 10),
}));
