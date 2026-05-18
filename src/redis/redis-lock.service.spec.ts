import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisLockService } from './redis-lock.service.js';
import { RedisService } from './redis.service.js';

type MockRedisClient = {
  eval: jest.Mock;
};

type MockRedisService = {
  setNX: jest.Mock;
  get: jest.Mock;
  exists: jest.Mock;
  getClient: jest.Mock;
};

let mockRedisClient: MockRedisClient;
let mockRedisService: MockRedisService;
let mockConfigService: Partial<ConfigService>;

jest.mock('./redis.service.js', () => ({
  RedisService: jest.fn().mockImplementation(() => ({
    setNX: mockRedisService.setNX,
    get: mockRedisService.get,
    exists: mockRedisService.exists,
    getClient: () => mockRedisClient,
  })),
}));

describe('RedisLockService', () => {
  let service: RedisLockService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRedisClient = {
      eval: jest.fn(),
    };

    mockRedisService = {
      setNX: jest.fn(),
      get: jest.fn(),
      exists: jest.fn(),
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, unknown> = {
          'app.session.lockTtl': 30000,
          'redis.keyPrefix': 'baileys:',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisLockService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RedisLockService>(RedisLockService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('acquireLock', () => {
    const resourceId = 'test-resource';

    it('acquires lock successfully', async () => {
      mockRedisService.setNX.mockResolvedValue(true);

      const lock = await service.acquireLock(resourceId);

      expect(lock).not.toBeNull();
      expect(lock).toHaveProperty('key');
      expect(lock).toHaveProperty('token');
      expect(lock).toHaveProperty('release');
      expect(typeof lock.release).toBe('function');
    });

    it('uses setNX with correct params', async () => {
      mockRedisService.setNX.mockResolvedValue(true);
      const ttlMs = 5000;

      await service.acquireLock(resourceId, { ttlMs });

      expect(mockRedisService.setNX).toHaveBeenCalledWith(
        'baileys:lock:test-resource',
        expect.any(String),
        ttlMs,
      );
    });

    it('returns null after max retries', async () => {
      mockRedisService.setNX.mockResolvedValue(false);

      const lock = await service.acquireLock(resourceId);

      expect(lock).toBeNull();
      expect(mockRedisService.setNX).toHaveBeenCalledTimes(3);
    });

    it('respects custom ttlMs', async () => {
      mockRedisService.setNX.mockResolvedValue(true);
      const customTtl = 10000;

      await service.acquireLock(resourceId, { ttlMs: customTtl });

      expect(mockRedisService.setNX).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        customTtl,
      );
    });

    it('respects custom retryCount', async () => {
      mockRedisService.setNX.mockResolvedValue(false);

      const lock = await service.acquireLock(resourceId, {
        retryCount: 5,
        retryDelayMs: 10,
      });

      expect(lock).toBeNull();
      expect(mockRedisService.setNX).toHaveBeenCalledTimes(5);
    });

    it('respects custom retryDelayMs', async () => {
      mockRedisService.setNX.mockResolvedValue(false);
      const retryDelayMs = 1000;

      const start = Date.now();
      await service.acquireLock(resourceId, { retryDelayMs, retryCount: 2 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(retryDelayMs);
    });

    it('exponential backoff on retry', async () => {
      mockRedisService.setNX.mockResolvedValue(false);
      const retryDelayMs = 100;

      const start = Date.now();
      await service.acquireLock(resourceId, { retryDelayMs, retryCount: 3 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(retryDelayMs * (1 + 2));
    });

    it('generates unique token', async () => {
      mockRedisService.setNX.mockResolvedValue(true);

      const lock1 = await service.acquireLock(resourceId);
      const lock2 = await service.acquireLock(resourceId);

      expect(lock1?.token).not.toBe(lock2?.token);
    });
  });

  describe('releaseLock', () => {
    const key = 'baileys:lock:test-resource';
    const token = 'test-token';

    it('releases with correct token', async () => {
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await service.releaseLock(key, token);

      expect(result).toBe(true);
      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get"'),
        1,
        key,
        token,
      );
    });

    it('does not release with wrong token', async () => {
      mockRedisClient.eval.mockResolvedValue(0);

      const result = await service.releaseLock(key, 'wrong-token');

      expect(result).toBe(false);
    });

    it('returns true on success', async () => {
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await service.releaseLock(key, token);

      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Redis error'));

      const result = await service.releaseLock(key, token);

      expect(result).toBe(false);
    });

    it('returns false when key not owned', async () => {
      mockRedisClient.eval.mockResolvedValue(0);

      const result = await service.releaseLock(key, 'not-my-token');

      expect(result).toBe(false);
    });
  });

  describe('extendLock', () => {
    const key = 'baileys:lock:test-resource';
    const token = 'test-token';
    const ttlMs = 5000;

    it('extends with correct token', async () => {
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await service.extendLock(key, token, ttlMs);

      expect(result).toBe(true);
      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("pexpire"'),
        1,
        key,
        token,
        ttlMs.toString(),
      );
    });

    it('does not extend with wrong token', async () => {
      mockRedisClient.eval.mockResolvedValue(0);

      const result = await service.extendLock(key, 'wrong-token', ttlMs);

      expect(result).toBe(false);
    });

    it('returns true on success', async () => {
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await service.extendLock(key, token, ttlMs);

      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Redis error'));

      const result = await service.extendLock(key, token, ttlMs);

      expect(result).toBe(false);
    });
  });

  describe('isLocked', () => {
    const resourceId = 'test-resource';

    it('returns true when locked', async () => {
      mockRedisService.exists.mockResolvedValue(true);

      const result = await service.isLocked(resourceId);

      expect(result).toBe(true);
      expect(mockRedisService.exists).toHaveBeenCalledWith(
        'baileys:lock:test-resource',
      );
    });

    it('returns false when not locked', async () => {
      mockRedisService.exists.mockResolvedValue(false);

      const result = await service.isLocked(resourceId);

      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockRedisService.exists.mockRejectedValue(new Error('Redis error'));

      const result = await service.isLocked(resourceId);

      expect(result).toBe(false);
    });
  });

  describe('getLockOwner', () => {
    const resourceId = 'test-resource';
    const token = 'test-token';

    it('returns token when locked', async () => {
      mockRedisService.get.mockResolvedValue(token);

      const result = await service.getLockOwner(resourceId);

      expect(result).toBe(token);
      expect(mockRedisService.get).toHaveBeenCalledWith(
        'baileys:lock:test-resource',
      );
    });

    it('returns null when not locked', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.getLockOwner(resourceId);

      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.getLockOwner(resourceId);

      expect(result).toBeNull();
    });
  });

  describe('Lock.release()', () => {
    it('calls releaseLock', async () => {
      mockRedisService.setNX.mockResolvedValue(true);
      mockRedisClient.eval.mockResolvedValue(1);

      const lock = await service.acquireLock('test-resource');
      const releaseSpy = jest.spyOn(service, 'releaseLock');

      await lock!.release();

      expect(releaseSpy).toHaveBeenCalledWith(lock!.key, lock!.token);
    });

    it('release returns boolean', async () => {
      mockRedisService.setNX.mockResolvedValue(true);
      mockRedisClient.eval.mockResolvedValue(1);

      const lock = await service.acquireLock('test-resource');
      const result = await lock!.release();

      expect(typeof result).toBe('boolean');
    });
  });
});
