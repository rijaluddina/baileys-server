jest.mock('../../redis/redis.service.js', () => ({
  RedisService: jest.fn().mockImplementation(() => ({
    subscribe: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(1),
  })),
}));

import { RpcClientService } from './rpc-client.service.js';
import { CB_CONFIG } from './rpc.types.js';

describe('RpcClientService', () => {
  let service: RpcClientService;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(1),
    };
    service = new RpcClientService(mockRedis);
  });

  describe('Circuit Breaker', () => {
    it('should allow requests when circuit is closed (default)', () => {
      expect(service.checkCircuit('worker1')).toBe(true);
    });

    it('should open circuit after failure threshold', () => {
      for (let i = 0; i < CB_CONFIG.FAILURE_THRESHOLD; i++) {
        service.recordFailure('worker1');
      }

      expect(service.checkCircuit('worker1')).toBe(false);
      const state = service.getCircuitState('worker1');
      expect(state?.state).toBe('open');
    });

    it('should transition to half-open after timeout', async () => {
      for (let i = 0; i < CB_CONFIG.FAILURE_THRESHOLD; i++) {
        service.recordFailure('worker1');
      }

      const state = service.getCircuitState('worker1');
      const oldFailureTime = state?.lastFailureTime ?? 0;
      const newFailureTime = Date.now() - CB_CONFIG.OPEN_TIMEOUT_MS - 1000;
      (state as any).lastFailureTime = newFailureTime;

      expect(service.checkCircuit('worker1')).toBe(true);
      const updatedState = service.getCircuitState('worker1');
      expect(updatedState?.state).toBe('half-open');

      (state as any).lastFailureTime = oldFailureTime;
    });

    it('should close circuit after success in half-open state', () => {
      for (let i = 0; i < CB_CONFIG.FAILURE_THRESHOLD; i++) {
        service.recordFailure('worker1');
      }

      const state = service.getCircuitState('worker1');
      (state as any).lastFailureTime =
        Date.now() - CB_CONFIG.OPEN_TIMEOUT_MS - 1000;
      service.checkCircuit('worker1');

      service.recordSuccess('worker1');

      const updatedState = service.getCircuitState('worker1');
      expect(updatedState?.state).toBe('closed');
      expect(updatedState?.failures).toBe(0);
    });

    it('should reset failures on success in closed state', () => {
      service.recordFailure('worker1');
      service.recordFailure('worker1');

      service.recordSuccess('worker1');

      const state = service.getCircuitState('worker1');
      expect(state?.failures).toBe(0);
      expect(state?.state).toBe('closed');
    });

    it('should open circuit immediately on failure in half-open state', () => {
      for (let i = 0; i < CB_CONFIG.FAILURE_THRESHOLD; i++) {
        service.recordFailure('worker1');
      }

      const state = service.getCircuitState('worker1');
      (state as any).lastFailureTime =
        Date.now() - CB_CONFIG.OPEN_TIMEOUT_MS - 1000;
      service.checkCircuit('worker1');

      service.recordFailure('worker1');

      const updatedState = service.getCircuitState('worker1');
      expect(updatedState?.state).toBe('open');
    });

    it('should allow reset of circuit breaker', () => {
      for (let i = 0; i < CB_CONFIG.FAILURE_THRESHOLD; i++) {
        service.recordFailure('worker1');
      }

      service.resetCircuit('worker1');

      expect(service.checkCircuit('worker1')).toBe(true);
      expect(service.getCircuitState('worker1')).toBeUndefined();
    });
  });

  describe('call method', () => {
    it('should return error when circuit is open', async () => {
      for (let i = 0; i < CB_CONFIG.FAILURE_THRESHOLD; i++) {
        service.recordFailure('worker1');
      }

      const result = await service.call('worker1', 'testAction', {
        data: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Circuit breaker open');
    });

    it('should publish message to Redis', async () => {
      await service.call(
        'worker1',
        'testAction',
        { data: 'test' },
        { timeout: 100 },
      );

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'rpc:requests:worker1',
        expect.any(String),
      );
    });
  });
});
