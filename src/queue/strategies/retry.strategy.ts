import type { BackoffOptions } from 'bullmq';

export interface RetryStrategyConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
}

export function createRetryStrategy(
  config: RetryStrategyConfig,
): BackoffOptions {
  return {
    type: 'exponential',
    delay: Math.min(config.baseDelayMs, config.maxDelayMs ?? 30000),
  };
}

export function shouldRetry(
  error: unknown,
  attempt: number,
  maxRetries: number,
): boolean {
  if (attempt >= maxRetries) return false;

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const nonRetryable = [
      'invalid',
      'not found',
      'unauthorized',
      'forbidden',
      'bad request',
    ];
    if (nonRetryable.some((term) => message.includes(term))) {
      return false;
    }
  }

  return true;
}

export function calculateDelay(
  attempt: number,
  config: RetryStrategyConfig,
): number {
  const {
    baseDelayMs,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    jitterFactor = 0.3,
  } = config;

  const exponentialDelay =
    baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  const jitter = cappedDelay * jitterFactor * Math.random();

  return Math.floor(cappedDelay + jitter);
}

export const DEFAULT_RETRY_STRATEGY: RetryStrategyConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
};

export const QUEUE_RETRY_CONFIGS: Record<string, RetryStrategyConfig> = {
  'message-send': {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.3,
  },
  'message-edit': {
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
  },
  'message-delete': {
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
  },
  'media-upload': {
    maxRetries: 3,
    baseDelayMs: 5000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitterFactor: 0.3,
  },
  'media-download': {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
  },
  'group-action': {
    maxRetries: 2,
    baseDelayMs: 3000,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
  },
  'webhook-deliver': {
    maxRetries: 5,
    baseDelayMs: 10000,
    maxDelayMs: 300000,
    backoffMultiplier: 2,
    jitterFactor: 0.3,
  },
  'session-init': {
    maxRetries: 2,
    baseDelayMs: 5000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },
};
