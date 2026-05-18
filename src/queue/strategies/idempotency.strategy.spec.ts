/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../../prisma/prisma.service.js';
import { IdempotencyStrategy } from './idempotency.strategy.js';

type MockPrismaIdempotencyKey = {
  findUnique: jest.Mock;
  upsert: jest.Mock;
  update: jest.Mock;
  deleteMany: jest.Mock;
};

type MockPrisma = {
  idempotencyKey: MockPrismaIdempotencyKey;
};

describe('IdempotencyStrategy', () => {
  let strategy: IdempotencyStrategy;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = {
      idempotencyKey: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    strategy = new IdempotencyStrategy(mockPrisma as unknown as PrismaService);
  });

  describe('isProcessing', () => {
    it('returns true when statusCode is 0 and no response and not expired', async () => {
      const futureDate = new Date(Date.now() + 60000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'processing',
        response: null,
        statusCode: 0,
        expiresAt: futureDate,
      });
      const result = await strategy.isProcessing('processing');
      expect(result).toBe(true);
    });

    it('returns false when key does not exist', async () => {
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
      const result = await strategy.isProcessing('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when entry is expired', async () => {
      const pastDate = new Date(Date.now() - 60000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'expired',
        response: null,
        statusCode: 0,
        expiresAt: pastDate,
      });
      const result = await strategy.isProcessing('expired');
      expect(result).toBe(false);
    });

    it('returns false when response is already set', async () => {
      const futureDate = new Date(Date.now() + 60000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'completed',
        response: { data: 'done' },
        statusCode: 200,
        expiresAt: futureDate,
      });
      const result = await strategy.isProcessing('completed');
      expect(result).toBe(false);
    });

    it('returns false when entry has response even if statusCode is 0', async () => {
      const futureDate = new Date(Date.now() + 60000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'completed-no-status',
        response: { data: 'some response' },
        statusCode: 0,
        expiresAt: futureDate,
      });
      const result = await strategy.isProcessing('completed-no-status');
      expect(result).toBe(false);
    });
  });

  describe('setResponse', () => {
    it('updates entry with response and statusCode', async () => {
      const responseData = { result: 'success' };
      await strategy.setResponse('test-key', responseData, 201, 86400);
      expect(mockPrisma.idempotencyKey.update).toHaveBeenCalledWith({
        where: { key: 'test-key' },
        data: {
          response: responseData,
          statusCode: 201,

          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('checkAndSet', () => {
    it('returns exists: false and creates entry for new key', async () => {
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
      const result = await strategy.checkAndSet('new-key', 300);
      expect(result.exists).toBe(false);
      expect(mockPrisma.idempotencyKey.upsert).toHaveBeenCalledWith({
        where: { key: 'new-key' },
        create: { key: 'new-key', expiresAt: expect.any(Date), statusCode: 0 },
        update: { expiresAt: expect.any(Date), statusCode: 0 },
      });
    });

    it('returns exists: true with cached entry for existing non-expired key with response', async () => {
      const futureDate = new Date(Date.now() + 60000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'existing-key',
        response: { data: 'cached' },
        statusCode: 200,
        expiresAt: futureDate,
      });
      const result = await strategy.checkAndSet('existing-key', 300);
      expect(result.exists).toBe(true);
      expect(result.entry).toEqual({
        response: { data: 'cached' },
        statusCode: 200,
      });
    });

    it('returns exists: false for expired key', async () => {
      const pastDate = new Date(Date.now() - 60000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'expired-key',
        response: { data: 'cached' },
        statusCode: 200,
        expiresAt: pastDate,
      });
      const result = await strategy.checkAndSet('expired-key', 300);
      expect(result.exists).toBe(false);
      expect(mockPrisma.idempotencyKey.upsert).toHaveBeenCalled();
    });
  });

  describe('cleanupExpired', () => {
    it('deletes expired entries and returns count', async () => {
      mockPrisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 5 });
      const result = await strategy.cleanupExpired();
      expect(result).toBe(5);
      expect(mockPrisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    it('returns 0 when no expired entries', async () => {
      mockPrisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 0 });
      const result = await strategy.cleanupExpired();
      expect(result).toBe(0);
    });
  });
});
