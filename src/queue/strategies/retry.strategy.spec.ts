import {
  createRetryStrategy,
  shouldRetry,
  calculateDelay,
  DEFAULT_RETRY_STRATEGY,
  QUEUE_RETRY_CONFIGS,
} from './retry.strategy.js';

describe('RetryStrategy', () => {
  describe('createRetryStrategy', () => {
    it('returns exponential backoff type', () => {
      const result = createRetryStrategy({ maxRetries: 3, baseDelayMs: 1000 });
      expect(result.type).toBe('exponential');
    });

    it('delay is capped at configured maxDelayMs', () => {
      const result = createRetryStrategy({
        maxRetries: 3,
        baseDelayMs: 50000,
        maxDelayMs: 30000,
      });
      expect(result.delay).toBe(30000);
    });

    it('uses baseDelayMs when maxDelayMs is undefined', () => {
      const result = createRetryStrategy({
        maxRetries: 3,
        baseDelayMs: 2000,
      });
      expect(result.delay).toBe(2000);
    });
  });

  describe('shouldRetry', () => {
    it('returns true when attempt is within maxRetries', () => {
      const result = shouldRetry(new Error('test'), 1, 3);
      expect(result).toBe(true);
    });

    it('returns false when attempt equals maxRetries', () => {
      const result = shouldRetry(new Error('test'), 3, 3);
      expect(result).toBe(false);
    });

    it('returns false when attempt exceeds maxRetries', () => {
      const result = shouldRetry(new Error('test'), 4, 3);
      expect(result).toBe(false);
    });

    it('returns false for error message containing invalid', () => {
      const error = new Error('invalid token');
      const result = shouldRetry(error, 1, 3);
      expect(result).toBe(false);
    });

    it('returns false for error message containing not found', () => {
      const error = new Error('resource not found');
      const result = shouldRetry(error, 1, 3);
      expect(result).toBe(false);
    });

    it('returns false for error message containing unauthorized', () => {
      const error = new Error('unauthorized access');
      const result = shouldRetry(error, 1, 3);
      expect(result).toBe(false);
    });

    it('returns false for error message containing forbidden', () => {
      const error = new Error('access forbidden');
      const result = shouldRetry(error, 1, 3);
      expect(result).toBe(false);
    });

    it('returns false for error message containing bad request', () => {
      const error = new Error('bad request format');
      const result = shouldRetry(error, 1, 3);
      expect(result).toBe(false);
    });

    it('returns true for other errors within retry limit', () => {
      const error = new Error('connection timeout');
      const result = shouldRetry(error, 1, 3);
      expect(result).toBe(true);
    });

    it('returns true for non-Error objects within retry limit', () => {
      const result = shouldRetry('string error', 1, 3);
      expect(result).toBe(true);
    });

    it('returns false for non-Error objects when attempt exceeds maxRetries', () => {
      const result = shouldRetry('string error', 5, 3);
      expect(result).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    it('delay grows exponentially with attempt number', () => {
      const config = {
        maxRetries: 3,
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };
      const delay1 = calculateDelay(1, config);
      const delay2 = calculateDelay(2, config);
      const delay3 = calculateDelay(3, config);
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('delay is capped at maxDelayMs', () => {
      const config = {
        maxRetries: 5,
        baseDelayMs: 10000,
        maxDelayMs: 15000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };
      const delay = calculateDelay(10, config);
      expect(delay).toBeLessThanOrEqual(15000);
    });

    it('jitter adds randomness when jitterFactor is non-zero', () => {
      const config = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0.3,
      };
      const delays: number[] = [];
      for (let i = 0; i < 10; i++) {
        delays.push(calculateDelay(2, config));
      }
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('uses default backoffMultiplier of 2 when not specified', () => {
      const config1 = { maxRetries: 3, baseDelayMs: 1000, jitterFactor: 0 };
      const config2 = {
        maxRetries: 3,
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };
      const delay1 = calculateDelay(2, config1);
      const delay2 = calculateDelay(2, config2);
      expect(delay1).toBe(delay2);
    });

    it('uses default jitterFactor of 0.3 when not specified', () => {
      const config = { maxRetries: 3, baseDelayMs: 1000, backoffMultiplier: 2 };
      const result = calculateDelay(1, config);
      expect(result).toBeGreaterThanOrEqual(1000);
      expect(result).toBeLessThanOrEqual(1300);
    });

    it('returns deterministic delay when jitterFactor is 0', () => {
      const config = {
        maxRetries: 3,
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };
      const delay1 = calculateDelay(1, config);
      const delay2 = calculateDelay(1, config);
      expect(delay1).toBe(delay2);
    });
  });

  describe('DEFAULT_RETRY_STRATEGY', () => {
    it('has correct default values', () => {
      expect(DEFAULT_RETRY_STRATEGY.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_STRATEGY.baseDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_STRATEGY.maxDelayMs).toBe(30000);
      expect(DEFAULT_RETRY_STRATEGY.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_STRATEGY.jitterFactor).toBe(0.3);
    });
  });

  describe('QUEUE_RETRY_CONFIGS', () => {
    it('contains configuration for message-send', () => {
      expect(QUEUE_RETRY_CONFIGS['message-send']).toBeDefined();
      expect(QUEUE_RETRY_CONFIGS['message-send'].maxRetries).toBe(3);
    });

    it('contains configuration for webhook-deliver', () => {
      expect(QUEUE_RETRY_CONFIGS['webhook-deliver']).toBeDefined();
      expect(QUEUE_RETRY_CONFIGS['webhook-deliver'].maxRetries).toBe(5);
    });

    it('contains configuration for session-init', () => {
      expect(QUEUE_RETRY_CONFIGS['session-init']).toBeDefined();
      expect(QUEUE_RETRY_CONFIGS['session-init'].maxRetries).toBe(2);
    });
  });
});
