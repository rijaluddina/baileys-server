import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WaRateLimiterService } from './wa-rate-limiter.service.js';
import { RedisService } from '../redis/redis.service.js';

type MockRedisClient = {
  zcount: jest.Mock;
  zrange: jest.Mock;
  zadd: jest.Mock;
  expire: jest.Mock;
  del: jest.Mock;
  pipeline: jest.Mock;
};

type MockPipeline = {
  zadd: jest.Mock;
  expire: jest.Mock;
  exec: jest.Mock;
};

let mockClient: MockRedisClient;

jest.mock('../redis/redis.service.js', () => ({
  RedisService: jest.fn().mockImplementation(() => ({
    getClient: () => mockClient as unknown,
  })),
}));

describe('WaRateLimiterService', () => {
  let service: WaRateLimiterService;
  let mockConfigService: Partial<ConfigService>;
  let mockPipeline: MockPipeline;

  const sessionId = 'test-session-123';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPipeline = {
      zadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      exec: jest.fn().mockResolvedValue([]),
    };

    mockClient = {
      zcount: jest.fn().mockResolvedValue(0),
      zrange: jest.fn().mockResolvedValue([]),
      zadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      pipeline: jest.fn().mockReturnValue(mockPipeline),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, unknown> = {
          'ratelimit.minDelayMs': 500,
          'ratelimit.burstLimit': 10,
          'ratelimit.burstWindowMs': 10000,
          'ratelimit.sustainedLimit': 60,
          'ratelimit.sustainedWindowMs': 60000,
          'redis.keyPrefix': 'baileys:',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaRateLimiterService,
        {
          provide: RedisService,
          useValue: new (RedisService as unknown as new () => RedisService)(),
        },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WaRateLimiterService>(WaRateLimiterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkLimit', () => {
    it('should allow when under all limits', async () => {
      const result = await service.checkLimit(sessionId);
      expect(result.allowed).toBe(true);
      expect(result.waitMs).toBe(0);
      expect(result.reason).toBeNull();
    });

    it('should enforce min delay between messages', async () => {
      await service.recordSent(sessionId);
      const result = await service.checkLimit(sessionId);

      expect(result.allowed).toBe(false);
      expect(result.waitMs).toBeGreaterThan(0);
      expect(result.reason).toContain('min_delay');
    });

    it('should enforce burst limit', async () => {
      mockClient.zcount = jest.fn().mockResolvedValue(10);

      const result = await service.checkLimit(sessionId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('burst_limit');
    });

    it('should enforce sustained limit', async () => {
      mockClient.zcount = jest
        .fn()
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(60);

      const result = await service.checkLimit(sessionId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('sustained_limit');
    });
  });

  describe('recordSent', () => {
    it('should record sent message and update counters', async () => {
      await service.recordSent(sessionId);

      expect(mockPipeline.zadd).toHaveBeenCalled();
      expect(mockPipeline.expire).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('clearLimits', () => {
    it('should clear all rate limit data for session', async () => {
      await service.recordSent(sessionId);
      await service.clearLimits(sessionId);

      expect(mockClient.del).toHaveBeenCalled();
    });
  });
});
