import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENCY_KEY = 'idempotency';

export interface IdempotencyOptions {
  ttlSeconds?: number;
  cacheResponse?: boolean;
}

export const IdempotencyKey = (options?: IdempotencyOptions) =>
  SetMetadata(IDEMPOTENCY_KEY, {
    ttlSeconds: 300,
    cacheResponse: true,
    ...options,
  });
