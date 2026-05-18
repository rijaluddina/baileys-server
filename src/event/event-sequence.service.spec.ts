jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

jest.mock('../redis/redis.service.js', () => ({
  RedisService: jest.fn().mockImplementation(() => mockRedis),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventSequenceService } from './event-sequence.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

type MockPrisma = {
  sessionEvent: {
    findFirst: jest.Mock;
  };
};

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
};

let mockPrisma: MockPrisma;
let mockRedis: MockRedis;

describe('EventSequenceService', () => {
  let service: EventSequenceService;

  const sessionId = 'test-session-123';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      sessionEvent: {
        findFirst: jest.fn(),
      },
    };

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSequenceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<EventSequenceService>(EventSequenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeForSession', () => {
    it('should load last sequence from DB and return it', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue({
        sequenceNumber: 5n,
      });
      mockRedis.set.mockResolvedValue();

      const result = await service.initializeForSession(sessionId);

      expect(result).toBe(5n);
      expect(mockPrisma.sessionEvent.findFirst).toHaveBeenCalledWith({
        where: { sessionId },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });
    });

    it('should return 0n when no events exist', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue();

      const result = await service.initializeForSession(sessionId);

      expect(result).toBe(0n);
    });
  });

  describe('next', () => {
    it('should increment sequence and return new value', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue({
        sequenceNumber: 10n,
      });
      mockRedis.set.mockResolvedValue();

      const result = await service.next(sessionId);

      expect(result).toBe(11n);
    });

    it('should initialize session if not already initialized', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue({
        sequenceNumber: 0n,
      });
      mockRedis.set.mockResolvedValue();

      const result = await service.next(sessionId);

      expect(result).toBe(1n);
      expect(mockPrisma.sessionEvent.findFirst).toHaveBeenCalled();
    });

    it('should increment multiple times correctly', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue({
        sequenceNumber: 0n,
      });
      mockRedis.set.mockResolvedValue();

      await service.next(sessionId);
      await service.next(sessionId);
      const result = await service.next(sessionId);

      expect(result).toBe(3n);
    });
  });

  describe('release', () => {
    it('should cleanup in-memory sequence', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue({
        sequenceNumber: 5n,
      });
      mockRedis.set.mockResolvedValue();
      mockRedis.del.mockResolvedValue();

      await service.next(sessionId);
      expect(service['sequences'].has(sessionId)).toBe(true);

      await service.release(sessionId);

      expect(service['sequences'].has(sessionId)).toBe(false);
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('getCurrentSequence', () => {
    it('should return undefined for uninitialized session', () => {
      const result = service.getCurrentSequence(sessionId);
      expect(result).toBeUndefined();
    });

    it('should return current sequence for initialized session', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue({
        sequenceNumber: 7n,
      });
      mockRedis.set.mockResolvedValue();

      await service.initializeForSession(sessionId);
      const result = service.getCurrentSequence(sessionId);

      expect(result).toBe(7n);
    });
  });
});
