import { Queue } from 'bullmq';
import { DeadLetterStrategy } from './dead-letter.strategy.js';

type MockQueueClient = {
  lpush: jest.Mock;
  lrange: jest.Mock;
  lrem: jest.Mock;
};

type MockJob = {
  id: string | number;
  name: string;
  data: unknown;
  attemptsMade: number;
  remove: jest.Mock;
};

type MockQueue = {
  name: string;
  client: Promise<MockQueueClient>;
  getJob: jest.Mock;
  add: jest.Mock;
};

const toQueue = (q: MockQueue): Queue => q as unknown as Queue;

describe('DeadLetterStrategy', () => {
  let strategy: DeadLetterStrategy;
  let mockClient: MockQueueClient;
  let mockQueue: MockQueue;

  beforeEach(() => {
    mockClient = {
      lpush: jest.fn().mockResolvedValue(1),
      lrange: jest.fn().mockResolvedValue([]),
      lrem: jest.fn().mockResolvedValue(1),
    };
    mockQueue = {
      name: 'test-queue',
      client: Promise.resolve(mockClient),
      getJob: jest.fn(),
      add: jest.fn().mockResolvedValue({}),
    };
    strategy = new DeadLetterStrategy();
  });

  describe('moveToDeadLetter', () => {
    it('returns early if job does not exist', async () => {
      mockQueue.getJob.mockResolvedValue(null);
      await strategy.moveToDeadLetter(toQueue(mockQueue), 'job-1', 'error', 3);
      expect(mockClient.lpush).not.toHaveBeenCalled();
    });

    it('does not move to DLQ if attemptsMade is less than maxRetries', async () => {
      const mockJob = {
        id: 'job-1',
        name: 'test',
        data: {},
        attemptsMade: 2,
        remove: jest.fn(),
      } as unknown as MockJob;
      mockQueue.getJob.mockResolvedValue(mockJob);
      await strategy.moveToDeadLetter(toQueue(mockQueue), 'job-1', 'error', 3);
      expect(mockClient.lpush).not.toHaveBeenCalled();
      expect(mockJob.remove).not.toHaveBeenCalled();
    });

    it('moves to DLQ when attemptsMade exceeds maxRetries', async () => {
      const mockJob = {
        id: 'job-1',
        name: 'test-job',
        data: { foo: 'bar' },
        attemptsMade: 3,
        remove: jest.fn().mockResolvedValue(undefined),
      } as unknown as MockJob;
      mockQueue.getJob.mockResolvedValue(mockJob);
      await strategy.moveToDeadLetter(
        toQueue(mockQueue),
        'job-1',
        'test error',
        3,
      );
      expect(mockClient.lpush).toHaveBeenCalledWith(
        'test-queue:dlq',
        expect.stringContaining('"jobId":"job-1"'),
      );
    });

    it('removes job after moving to DLQ', async () => {
      const mockJob = {
        id: 'job-1',
        name: 'test-job',
        data: { foo: 'bar' },
        attemptsMade: 3,
        remove: jest.fn().mockResolvedValue(undefined),
      } as unknown as MockJob;
      mockQueue.getJob.mockResolvedValue(mockJob);
      await strategy.moveToDeadLetter(toQueue(mockQueue), 'job-1', 'error', 3);
      expect(mockJob.remove).toHaveBeenCalled();
    });
  });

  describe('getDeadLetterEntries', () => {
    it('returns parsed entries from DLQ', async () => {
      const entry = {
        queueName: 'test-queue',
        jobId: 'job-1',
        jobName: 'test-job',
        data: {},
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'manual',
      };
      mockClient.lrange.mockResolvedValue([JSON.stringify(entry)]);
      const result = await strategy.getDeadLetterEntries(toQueue(mockQueue));
      expect(result).toHaveLength(1);
      expect(result[0].jobId).toBe('job-1');
    });

    it('returns fallback entry when JSON.parse fails', async () => {
      mockClient.lrange.mockResolvedValue(['invalid json {']);
      const result = await strategy.getDeadLetterEntries(toQueue(mockQueue));
      expect(result).toHaveLength(1);
      expect(result[0].failedReason).toBe('Parse error');
      expect(result[0].jobId).toBe('unknown');
    });

    it('respects limit parameter', async () => {
      const entry = {
        queueName: 'test-queue',
        jobId: 'job-1',
        jobName: 'test-job',
        data: {},
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'manual' as const,
      };
      mockClient.lrange.mockResolvedValue([
        JSON.stringify(entry),
        JSON.stringify(entry),
      ]);
      await strategy.getDeadLetterEntries(toQueue(mockQueue), 1);
      expect(mockClient.lrange).toHaveBeenCalledWith('test-queue:dlq', 0, 0);
    });
  });

  describe('retryDeadLetter', () => {
    it('requeues specific job with attempts: 1', async () => {
      const entry = {
        queueName: 'test-queue',
        jobId: 'job-1',
        jobName: 'retry-job',
        data: { key: 'value' },
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'retry' as const,
      };
      mockClient.lrange.mockResolvedValue([JSON.stringify(entry)]);
      await strategy.retryDeadLetter(toQueue(mockQueue), 'job-1');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'retry-job',
        { key: 'value' },
        { attempts: 1, removeOnComplete: true },
      );
    });

    it('removes entry from DLQ after successful retry', async () => {
      const entry = {
        queueName: 'test-queue',
        jobId: 'job-1',
        jobName: 'retry-job',
        data: {},
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'retry' as const,
      };
      mockClient.lrange.mockResolvedValue([JSON.stringify(entry)]);
      await strategy.retryDeadLetter(toQueue(mockQueue), 'job-1');
      expect(mockClient.lrem).toHaveBeenCalled();
    });

    it('retries all entries when jobId is "all"', async () => {
      const entry1 = {
        queueName: 'test-queue',
        jobId: 'job-1',
        jobName: 'job-1',
        data: {},
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'retry' as const,
      };
      const entry2 = {
        queueName: 'test-queue',
        jobId: 'job-2',
        jobName: 'job-2',
        data: {},
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'retry' as const,
      };
      mockClient.lrange.mockResolvedValue([
        JSON.stringify(entry1),
        JSON.stringify(entry2),
      ]);
      await strategy.retryDeadLetter(toQueue(mockQueue), 'all');
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('continues on parse errors', async () => {
      const entry = {
        queueName: 'test-queue',
        jobId: 'job-1',
        jobName: 'retry-job',
        data: {},
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'retry' as const,
      };
      mockClient.lrange.mockResolvedValue([
        'invalid json',
        JSON.stringify(entry),
      ]);
      await strategy.retryDeadLetter(toQueue(mockQueue), 'job-1');
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'retry-job',
        {},
        { attempts: 1, removeOnComplete: true },
      );
    });
  });

  describe('discardDeadLetter', () => {
    it('removes specific job from DLQ', async () => {
      const entry = {
        queueName: 'test-queue',
        jobId: 'job-1',
        jobName: 'discard-job',
        data: {},
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'discard' as const,
      };
      mockClient.lrange.mockResolvedValue([JSON.stringify(entry)]);
      await strategy.discardDeadLetter(toQueue(mockQueue), 'job-1');
      expect(mockClient.lrem).toHaveBeenCalled();
    });

    it('removes all entries when jobId is "all"', async () => {
      const entry1 = {
        queueName: 'test-queue',
        jobId: 'job-1',
        jobName: 'job-1',
        data: {},
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'discard' as const,
      };
      const entry2 = {
        queueName: 'test-queue',
        jobId: 'job-2',
        jobName: 'job-2',
        data: {},
        failedReason: 'error',
        failedAttempts: 3,
        failedAt: new Date().toISOString(),
        action: 'discard' as const,
      };
      mockClient.lrange.mockResolvedValue([
        JSON.stringify(entry1),
        JSON.stringify(entry2),
      ]);
      await strategy.discardDeadLetter(toQueue(mockQueue), 'all');
      expect(mockClient.lrem).toHaveBeenCalledTimes(2);
    });
  });
});
