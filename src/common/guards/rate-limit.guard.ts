import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windowMs: number;
  private readonly max: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.windowMs =
      this.configService.get<number>('app.rateLimiting.messageSend.windowMs') ??
      60000;
    this.max =
      this.configService.get<number>('app.rateLimiting.messageSend.max') ?? 60;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ ip?: string; user?: { sub?: string } }>();
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader: (k: string, v: string | number) => void }>();

    const identifier = request.user?.sub ?? request.ip ?? 'unknown';
    const key = `ratelimit:${identifier}`;

    const current = await this.redisService.incr(key);

    if (current === 1) {
      await this.redisService.expire(key, Math.ceil(this.windowMs / 1000));
    }

    const remaining = Math.max(0, this.max - current);
    const resetAt = Date.now() + this.windowMs;

    response.setHeader('X-RateLimit-Limit', this.max);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader('X-RateLimit-Reset', resetAt);

    if (current > this.max) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests. Max ${this.max} per ${this.windowMs}ms.`,
          },
          meta: {
            timestamp: new Date().toISOString(),
            retryAfter: Math.ceil(this.windowMs / 1000),
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
