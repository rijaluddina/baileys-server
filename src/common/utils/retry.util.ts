export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
  retryCondition?: (error: unknown) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: unknown;
  attempts: number;
  totalTimeMs: number;
}

const defaultRetryCondition = (error: unknown): boolean => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection')
    ) {
      return true;
    }
  }
  return false;
};

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<RetryResult<T>> {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    jitterFactor = 0,
    retryCondition = defaultRetryCondition,
  } = options;

  const startTime = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts) break;

      if (!retryCondition(err)) break;

      const backoffDelay = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs,
      );
      const jitter =
        jitterFactor > 0 ? backoffDelay * jitterFactor * Math.random() : 0;
      const delay = backoffDelay + jitter;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxAttempts,
    totalTimeMs: Date.now() - startTime,
  };
}

export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitterFactor = 0.3,
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  const jitter = delay * jitterFactor * Math.random();
  return delay + jitter;
}
