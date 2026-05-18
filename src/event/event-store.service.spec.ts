/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access */
import { EventStoreService, StoreEventOptions } from './event-store.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('EventStoreService', () => {
  let service: EventStoreService;
  let mockPrisma: {
    sessionEvent: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      sessionEvent: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    service = new EventStoreService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('store', () => {
    it('should create sessionEvent with sequence number', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue(null);

      const options: StoreEventOptions = {
        sessionId: 'session-1',
        eventType: 'test.event',
        payload: { data: 'test' },
      };

      await service.store(options);

      expect(mockPrisma.sessionEvent.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          eventType: 'test.event',
          payload: { data: 'test' },
          sequenceNumber: 1n,
        },
      });
    });

    it('should increment sequence from latest in DB', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue({
        sequenceNumber: 5n,
      });

      const options: StoreEventOptions = {
        sessionId: 'session-1',
        eventType: 'test.event',
        payload: {},
      };

      await service.store(options);

      expect(mockPrisma.sessionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sequenceNumber: 6n,
          }),
        }),
      );
    });

    it('should handle store errors gracefully', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.sessionEvent.create.mockRejectedValue(new Error('DB error'));

      const options: StoreEventOptions = {
        sessionId: 'session-1',
        eventType: 'test.event',
        payload: {},
      };

      await expect(service.store(options)).resolves.not.toThrow();
    });
  });

  describe('getEvents', () => {
    it('should return events ordered by sequenceNumber asc', async () => {
      const mockEvents = [
        {
          id: '1',
          eventType: 'e1',
          payload: {},
          sequenceNumber: 1n,
          createdAt: new Date(),
        },
        {
          id: '2',
          eventType: 'e2',
          payload: {},
          sequenceNumber: 2n,
          createdAt: new Date(),
        },
        {
          id: '3',
          eventType: 'e3',
          payload: {},
          sequenceNumber: 3n,
          createdAt: new Date(),
        },
      ];
      mockPrisma.sessionEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getEvents('session-1');

      expect(mockPrisma.sessionEvent.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
        orderBy: { sequenceNumber: 'asc' },
        take: 100,
      });
      expect(result).toHaveLength(3);
      expect(result[0].sequenceNumber).toBe(1n);
      expect(result[1].sequenceNumber).toBe(2n);
      expect(result[2].sequenceNumber).toBe(3n);
    });

    it('should filter by fromSequence', async () => {
      mockPrisma.sessionEvent.findMany.mockResolvedValue([]);

      await service.getEvents('session-1', { fromSequence: 5n });

      expect(mockPrisma.sessionEvent.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1', sequenceNumber: { gt: '5' } },
        orderBy: { sequenceNumber: 'asc' },
        take: 100,
      });
    });

    it('should respect limit option', async () => {
      mockPrisma.sessionEvent.findMany.mockResolvedValue([]);

      await service.getEvents('session-1', { limit: 50 });

      expect(mockPrisma.sessionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('should default limit to 100', async () => {
      mockPrisma.sessionEvent.findMany.mockResolvedValue([]);

      await service.getEvents('session-1', {});

      expect(mockPrisma.sessionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should filter by eventTypes', async () => {
      mockPrisma.sessionEvent.findMany.mockResolvedValue([]);

      await service.getEvents('session-1', {
        eventTypes: ['type.a', 'type.b'],
      });

      expect(mockPrisma.sessionEvent.findMany).toHaveBeenCalledWith({
        where: {
          sessionId: 'session-1',
          eventType: { in: ['type.a', 'type.b'] },
        },
        orderBy: { sequenceNumber: 'asc' },
        take: 100,
      });
    });

    it('should combine fromSequence and eventTypes filters', async () => {
      mockPrisma.sessionEvent.findMany.mockResolvedValue([]);

      await service.getEvents('session-1', {
        fromSequence: 10n,
        eventTypes: ['filtered.type'],
      });

      expect(mockPrisma.sessionEvent.findMany).toHaveBeenCalledWith({
        where: {
          sessionId: 'session-1',
          sequenceNumber: { gt: '10' },
          eventType: { in: ['filtered.type'] },
        },
        orderBy: { sequenceNumber: 'asc' },
        take: 100,
      });
    });

    it('should map bigint sequenceNumber to string for query', async () => {
      mockPrisma.sessionEvent.findMany.mockResolvedValue([]);

      await service.getEvents('session-1', {
        fromSequence: BigInt('12345678901234567890'),
      });

      expect(mockPrisma.sessionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sequenceNumber: { gt: '12345678901234567890' },
          }),
        }),
      );
    });
  });

  describe('getEventCount', () => {
    it('should return count of events for session', async () => {
      mockPrisma.sessionEvent.count.mockResolvedValue(42);

      const result = await service.getEventCount('session-1');

      expect(result).toBe(42);
      expect(mockPrisma.sessionEvent.count).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
      });
    });
  });

  describe('cleanupOldEvents', () => {
    it('should delete events older than retentionDays', async () => {
      mockPrisma.sessionEvent.deleteMany.mockResolvedValue({ count: 15 });

      const result = await service.cleanupOldEvents('session-1', 30);

      expect(result).toBe(15);
      expect(mockPrisma.sessionEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          sessionId: 'session-1',
          createdAt: expect.any(Object),
        },
      });
    });

    it('should return count of deleted events', async () => {
      mockPrisma.sessionEvent.deleteMany.mockResolvedValue({ count: 7 });

      const result = await service.cleanupOldEvents('session-1', 7);

      expect(result).toBe(7);
    });

    it('should use correct date cutoff calculation', async () => {
      const beforeCall = new Date();
      mockPrisma.sessionEvent.deleteMany.mockResolvedValue({ count: 0 });

      await service.cleanupOldEvents('session-1', 30);

      const afterCall = new Date();
      const cutoffArg: string | number | Date =
        mockPrisma.sessionEvent.deleteMany.mock.calls[0][0].where.createdAt.lt;
      const cutoffDate = new Date(cutoffArg);

      const expectedMin = new Date(beforeCall);
      expectedMin.setDate(expectedMin.getDate() - 30);

      const expectedMax = new Date(afterCall);
      expectedMax.setDate(expectedMax.getDate() - 30);

      expect(cutoffDate.getTime()).toBeGreaterThanOrEqual(
        expectedMin.getTime(),
      );
      expect(cutoffDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });
  });

  describe('getNextSequence', () => {
    it('should start at BigInt(1) for new session', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValue(null);

      const result = service['getNextSequence']('new-session');

      await expect(result).resolves.toBe(1n);
    });

    it('should increment from latest sequence in DB', async () => {
      mockPrisma.sessionEvent.findFirst.mockResolvedValueOnce({
        sequenceNumber: 9n,
      });

      const result = service['getNextSequence']('session-1');

      await expect(result).resolves.toBe(10n);
    });

    it('should cache sequence in memory across calls', async () => {
      mockPrisma.sessionEvent.findFirst
        .mockResolvedValueOnce({ sequenceNumber: 0n })
        .mockResolvedValueOnce({ sequenceNumber: 1n })
        .mockResolvedValueOnce({ sequenceNumber: 2n });

      const result1 = await service['getNextSequence']('cached-session');
      const result2 = await service['getNextSequence']('cached-session');

      expect(result1).toBe(1n);
      expect(result2).toBe(2n);
    });

    it('should handle multiple sessions independently', async () => {
      mockPrisma.sessionEvent.findFirst
        .mockResolvedValueOnce({ sequenceNumber: 4n })
        .mockResolvedValueOnce({ sequenceNumber: 2n })
        .mockResolvedValueOnce({ sequenceNumber: 4n });

      const result1 = await service['getNextSequence']('session-a');
      const result2 = await service['getNextSequence']('session-b');
      const result3 = await service['getNextSequence']('session-a');

      expect(result1).toBe(5n);
      expect(result2).toBe(3n);
      expect(result3).toBe(5n);
    });
  });
});
