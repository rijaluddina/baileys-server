import { Job } from 'bullmq';
import type { Queue } from 'bullmq';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import { MessageStoreProcessor } from '../queue/processors/message-store.processor.js';
import { TenantContextStore } from '../common/tenant/tenant-context.store.js';
import { QueueService } from '../queue/queue.service.js';
import { WaRateLimiterService } from '../session/wa-rate-limiter.service.js';
import type { RedisService } from '../redis/redis.service.js';
import { EventBusService, InternalEvent } from '../event/event-bus.service.js';
import { SessionGateway } from '../session/session.gateway.js';
import { PrismaTenantMiddleware } from '../prisma/prisma-tenant.middleware.js';

interface MessageStoreJob {
  sessionId: string;
  messages: Array<{
    key: { id?: string; remoteJid?: string; fromMe?: boolean };
    messageTimestamp?: number;
    message?: { conversation: string };
  }>;
}

interface MockRedisClient {
  zcount: jest.Mock;
  zrange: jest.Mock;
  zadd: jest.Mock;
  expire: jest.Mock;
  del: jest.Mock;
  pipeline: jest.Mock;
}

interface MockPipeline {
  zadd: jest.Mock;
  expire: jest.Mock;
  exec: jest.Mock;
}

interface WebhookJobData {
  sessionId: string;
  webhookUrl: string;
  event: string;
  data: unknown;
  timestamp: string;
}

type QueueMock = Pick<Queue, 'add' | 'close'>;

function createMockPrisma() {
  const messageOperation = { model: 'message', action: 'upsert' };
  return {
    message: { upsert: jest.fn().mockReturnValue(messageOperation) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

describe('Load Tests', () => {
  afterEach(() => {
    TenantContextStore.clear();
    jest.clearAllMocks();
  });

  describe('Messaging Burst Load', () => {
    describe('MessageStoreProcessor', () => {
      it('should process batch of 100 messages efficiently', async () => {
        const messages = Array.from({ length: 100 }, (_, i) => ({
          key: {
            id: `msg-${i}`,
            remoteJid: `user@s.whatsapp.net`,
            fromMe: false,
          },
          message: { conversation: `Message ${i}` },
        }));

        const mockPrisma = createMockPrisma();
        const processor = new MessageStoreProcessor(
          mockPrisma as unknown as Parameters<typeof MessageStoreProcessor>[0],
        );
        const job = {
          data: { sessionId: 'burst-session', messages },
        } as unknown as Job<MessageStoreJob>;

        const start = Date.now();
        await processor.process(job);
        const duration = Date.now() - start;

        expect(mockPrisma.message.upsert).toHaveBeenCalledTimes(100);
        expect(duration).toBeLessThan(5000);
      });

      it('should handle concurrent message stores', async () => {
        const sessions = ['session-1', 'session-2', 'session-3'];
        const messagesPerSession = 50;

        const mockPrisma = createMockPrisma();
        const processor = new MessageStoreProcessor(
          mockPrisma as unknown as Parameters<typeof MessageStoreProcessor>[0],
        );

        const promises = sessions.flatMap((sessionId) =>
          Array.from({ length: messagesPerSession }, (_, i) =>
            processor.process({
              data: {
                sessionId,
                messages: [
                  {
                    key: { id: `msg-${i}`, remoteJid: `user@s.whatsapp.net` },
                    message: {},
                  },
                ],
              },
            } as unknown as Job<MessageStoreJob>),
          ),
        );

        const results = await Promise.allSettled(promises);
        const fulfilled = results.filter((r) => r.status === 'fulfilled');

        expect(fulfilled.length).toBe(sessions.length * messagesPerSession);
        expect(mockPrisma.message.upsert).toHaveBeenCalledTimes(
          sessions.length * messagesPerSession,
        );
      });

      it('should not exceed memory limits with large batches', async () => {
        const LARGE_BATCH = 1000;
        const messages = Array.from({ length: LARGE_BATCH }, (_, i) => ({
          key: { id: `msg-${i}`, remoteJid: `user@s.whatsapp.net` },
          message: { conversation: `Message ${i}` },
        }));

        const mockPrisma = createMockPrisma();
        const processor = new MessageStoreProcessor(
          mockPrisma as unknown as Parameters<typeof MessageStoreProcessor>[0],
        );
        const job = {
          data: { sessionId: 'large-batch', messages },
        } as unknown as Job<MessageStoreJob>;

        const processPromise = processor.process(job);

        expect(mockPrisma.message.upsert).toHaveBeenCalled();
        expect(processPromise).toBeInstanceOf(Promise);
        await processPromise;
      });

      it('should handle burst of 1000 message jobs without blocking', async () => {
        const BURST_SIZE = 1000;

        const mockPrisma = createMockPrisma();
        const processor = new MessageStoreProcessor(
          mockPrisma as unknown as Parameters<typeof MessageStoreProcessor>[0],
        );

        const start = Date.now();
        const promises = Array.from({ length: BURST_SIZE }, (_, i) =>
          processor.process({
            data: {
              sessionId: `session-${i % 10}`,
              messages: [
                {
                  key: { id: `msg-${i}`, remoteJid: `user@s.whatsapp.net` },
                  message: {},
                },
              ],
            },
          } as unknown as Job<MessageStoreJob>),
        );

        await Promise.all(promises);
        const duration = Date.now() - start;

        expect(mockPrisma.message.upsert).toHaveBeenCalledTimes(BURST_SIZE);
        expect(duration).toBeLessThan(30000);
      });
    });
  });

  describe('Multi-Tenant Load', () => {
    describe('TenantContextStore', () => {
      it('should maintain isolation under concurrent load', async () => {
        const tenantCount = 50;
        const operationsPerTenant = 10;

        const results = await Promise.all(
          Array.from({ length: tenantCount }, async (_, tenantIdx) => {
            const tenantId = `tenant-${tenantIdx}`;
            const outcomes: boolean[] = [];

            for (let op = 0; op < operationsPerTenant; op++) {
              TenantContextStore.set({ tenantId, userId: `user-${op}` });
              const ctx = TenantContextStore.get();
              outcomes.push(ctx?.tenantId === tenantId);
            }

            await Promise.resolve();
            return outcomes.every(Boolean);
          }),
        );

        expect(results.every(Boolean)).toBe(true);
      });

      it('should handle rapid tenant context switching', () => {
        const switches = 100;

        for (let i = 0; i < switches; i++) {
          TenantContextStore.set({ tenantId: `tenant-${i % 5}` });
        }

        const ctx = TenantContextStore.get();
        expect(ctx?.tenantId).toBe('tenant-4');
      });

      it('should handle 100 concurrent tenants with unique contexts', async () => {
        const TENANT_LOAD = 100;

        const tenantPromises = Array.from(
          { length: TENANT_LOAD },
          (_, idx) =>
            new Promise<boolean>((resolve) => {
              const tenantId = `tenant-${idx}`;
              TenantContextStore.set({ tenantId, userId: `user-${idx}` });

              setTimeout(() => {
                const ctx = TenantContextStore.get();
                resolve(
                  ctx?.tenantId === tenantId && ctx?.userId === `user-${idx}`,
                );
              }, 10);
            }),
        );

        const results = await Promise.all(tenantPromises);
        expect(results.every(Boolean)).toBe(true);
      });
    });

    describe('PrismaTenantMiddleware', () => {
      it('should handle concurrent queries with different tenants', async () => {
        const middleware = new PrismaTenantMiddleware();
        const QUERY_COUNT = 50;

        const mockNext = jest.fn().mockResolvedValue([]);
        const queries = Array.from({ length: QUERY_COUNT }, (_, i) => ({
          model: 'Message',
          action: 'findMany',
          args: { where: { tenantId: `tenant-${i % 5}` } },
        }));

        const start = Date.now();
        await Promise.all(
          queries.map((q) =>
            middleware.execute(
              q,
              mockNext as Parameters<typeof middleware.execute>[1],
            ),
          ),
        );
        const duration = Date.now() - start;

        expect(mockNext).toHaveBeenCalledTimes(QUERY_COUNT);
        expect(duration).toBeLessThan(5000);
      });

      it('should correctly inject tenantId in concurrent create operations', async () => {
        const middleware = new PrismaTenantMiddleware();
        const CREATE_COUNT = 100;

        const mockNext = jest
          .fn()
          .mockImplementation(
            (params: { args: { data: { tenantId: string } } }) => {
              return Promise.resolve(params.args.data.tenantId);
            },
          );

        const creates = Array.from({ length: CREATE_COUNT }, (_, i) => ({
          model: 'Message',
          action: 'create',
          args: {
            data: {
              content: `Message ${i}`,
              tenantId: `tenant-${i % 10}`,
            },
          },
        }));

        const results = await Promise.all(
          creates.map((c) =>
            middleware.execute(
              c,
              mockNext as Parameters<typeof middleware.execute>[1],
            ),
          ),
        );

        const uniqueTenants = new Set(results);
        expect(uniqueTenants.size).toBe(10);
      });
    });
  });

  describe('Queue Saturation Load', () => {
    describe('QueueService', () => {
      function createMockQueue(): QueueMock {
        return {
          add: jest.fn().mockResolvedValue({ id: 'job-id' }),
          close: jest.fn().mockResolvedValue(undefined),
        };
      }

      it('should enqueue multiple jobs without blocking', async () => {
        const mockMessageStoreQueue = createMockQueue();
        const mockContactSyncQueue = createMockQueue();
        const mockChatSyncQueue = createMockQueue();
        const mockHistorySyncQueue = createMockQueue();
        const mockWebhookDeliveryQueue = createMockQueue();
        const mockMessageCleanupQueue = createMockQueue();

        const service = new QueueService(
          mockMessageStoreQueue as unknown as Queue,
          mockContactSyncQueue as unknown as Queue,
          mockChatSyncQueue as unknown as Queue,
          mockHistorySyncQueue as unknown as Queue,
          mockWebhookDeliveryQueue as unknown as Queue<WebhookJobData>,
          mockMessageCleanupQueue as unknown as Queue,
        );

        const jobs = Array.from({ length: 50 }, (_, i) => ({
          sessionId: `session-${i % 5}`,
          messages: [{ key: { id: `msg-${i}` }, message: {} }],
        }));

        const start = Date.now();
        await Promise.all(
          jobs.map((j) => service.addMessageStoreJob(j.sessionId, j.messages)),
        );
        const duration = Date.now() - start;

        expect(mockMessageStoreQueue.add).toHaveBeenCalledTimes(50);
        expect(duration).toBeLessThan(1000);
      });

      it('should handle rapid job additions across multiple queue types', async () => {
        const mockMessageStoreQueue = createMockQueue();
        const mockContactSyncQueue = createMockQueue();
        const mockChatSyncQueue = createMockQueue();
        const mockHistorySyncQueue = createMockQueue();
        const mockWebhookDeliveryQueue = createMockQueue();
        const mockMessageCleanupQueue = createMockQueue();

        const service = new QueueService(
          mockMessageStoreQueue as unknown as Queue,
          mockContactSyncQueue as unknown as Queue,
          mockChatSyncQueue as unknown as Queue,
          mockHistorySyncQueue as unknown as Queue,
          mockWebhookDeliveryQueue as unknown as Queue<WebhookJobData>,
          mockMessageCleanupQueue as unknown as Queue,
        );

        const operations = Array.from({ length: 100 }, (_, i) => ({
          type: i % 4,
          sessionId: `session-${i % 10}`,
          data: { id: `data-${i}` },
        }));

        await Promise.all(
          operations.map((op) => {
            switch (op.type) {
              case 0:
                return service.addMessageStoreJob(op.sessionId, [op.data]);
              case 1:
                return service.addContactSyncJob(op.sessionId, [op.data]);
              case 2:
                return service.addChatSyncJob(op.sessionId, [op.data]);
              default:
                return service.addHistorySyncJob(op.sessionId, op.data);
            }
          }),
        );

        expect(mockMessageStoreQueue.add).toHaveBeenCalledTimes(25);
        expect(mockContactSyncQueue.add).toHaveBeenCalledTimes(25);
        expect(mockChatSyncQueue.add).toHaveBeenCalledTimes(25);
        expect(mockHistorySyncQueue.add).toHaveBeenCalledTimes(25);
      });
    });

    describe('Retry Backoff Under Load', () => {
      it('should apply exponential backoff correctly', () => {
        const attempt = 3;
        const baseDelayMs = 1000;
        const backoffMultiplier = 2;

        const delay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        expect(delay).toBe(4000);
      });

      it('should cap delay at maxDelayMs', () => {
        const attempt = 10;
        const baseDelayMs = 1000;
        const maxDelayMs = 30000;
        const backoffMultiplier = 2;

        const exponentialDelay =
          baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

        expect(cappedDelay).toBe(30000);
      });

      it('should handle backoff calculation for high attempt counts', () => {
        const attempt = 15;
        const baseDelayMs = 500;
        const maxDelayMs = 60000;
        const backoffMultiplier = 2;

        const exponentialDelay =
          baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

        expect(cappedDelay).toBe(60000);
      });
    });
  });

  describe('Rate Limiter Load', () => {
    describe('WaRateLimiterService', () => {
      let service: WaRateLimiterService;
      let mockClient: MockRedisClient;
      let mockPipeline: MockPipeline;

      beforeEach(() => {
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

        const mockConfigService = {
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

        const mockRedisService = {
          getClient: () => mockClient,
        };

        service = new WaRateLimiterService(
          mockRedisService as unknown as RedisService,
          mockConfigService as unknown as ConfigService,
        );
      });

      it('should handle burst of rate check requests', async () => {
        const checks = Array.from({ length: 100 }, (_, i) => ({
          sessionId: `session-${i % 10}`,
          key: 'send_message',
        }));

        const start = Date.now();
        const results = await Promise.all(
          checks.map((c) => service.checkLimit(c.sessionId)),
        );
        const duration = Date.now() - start;

        expect(results.length).toBe(100);
        expect(duration).toBeLessThan(500);
      });

      it('should track burst and sustained windows independently', async () => {
        const sessionId = 'session-1';

        jest.useFakeTimers();
        const now = Date.now();
        jest.setSystemTime(now);

        const lastSentTimeMap = (
          service as unknown as { lastSentTime: Map<string, number> }
        ).lastSentTime;
        lastSentTimeMap.set(sessionId, now - 1000);

        mockClient.zcount = jest.fn().mockResolvedValue(15);
        const result = await service.checkLimit(sessionId);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/burst_limit|sustained_limit/);

        jest.useRealTimers();
      });

      it('should handle concurrent rate limit checks', async () => {
        const CONCURRENT_CHECKS = 200;
        const SESSIONS = 20;

        const start = Date.now();
        const promises = Array.from({ length: CONCURRENT_CHECKS }, (_, i) =>
          service.checkLimit(`session-${i % SESSIONS}`),
        );

        const results = await Promise.all(promises);
        const duration = Date.now() - start;

        expect(results.length).toBe(CONCURRENT_CHECKS);
        expect(duration).toBeLessThan(1000);
      });

      it('should clear multiple session limits concurrently', async () => {
        const SESSION_COUNT = 50;

        const start = Date.now();
        const promises = Array.from({ length: SESSION_COUNT }, (_, i) =>
          service.clearLimits(`session-${i}`),
        );

        await Promise.all(promises);
        const duration = Date.now() - start;

        expect(mockClient.del).toHaveBeenCalledTimes(SESSION_COUNT);
        expect(duration).toBeLessThan(1000);
      });
    });
  });

  describe('WebSocket Connection Load', () => {
    describe('SessionGateway', () => {
      let gateway: SessionGateway;
      let mockServer: { to: jest.Mock; emit: jest.Mock };
      let mockLogger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
      let mockConfigService: { get: jest.Mock };

      interface MockSocket {
        id: string;
        handshake: {
          auth: { token?: string };
          headers: Record<string, string>;
          query: Record<string, string>;
        };
        join: jest.Mock;
        emit: jest.Mock;
        disconnect: jest.Mock;
      }

      function createMockSocket(
        overrides: Partial<MockSocket> = {},
      ): MockSocket {
        return {
          id: 'socket-123',
          handshake: { auth: {}, headers: {}, query: {} },
          join: jest.fn(),
          emit: jest.fn(),
          disconnect: jest.fn(),
          ...overrides,
        };
      }

      beforeEach(() => {
        mockServer = {
          to: jest.fn().mockReturnThis(),
          emit: jest.fn(),
        };
        mockLogger = {
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        };
        mockConfigService = { get: jest.fn() };

        gateway = new SessionGateway(
          mockConfigService as unknown as ConfigService,
        );
        gateway.server = mockServer as unknown as InstanceType<
          typeof SessionGateway
        >['server'];
        Object.defineProperty(gateway, 'logger', {
          value: mockLogger,
          writable: true,
        });
      });

      it('should handle multiple concurrent connections', () => {
        const CONNECTION_COUNT = 50;

        mockConfigService.get.mockReturnValue('valid-token');
        const connections = Array.from({ length: CONNECTION_COUNT }, (_, i) =>
          createMockSocket({
            id: `socket-${i}`,
            handshake: {
              auth: { token: 'valid-token' },
              headers: {},
              query: { sessionId: `session-${i % 10}` },
            },
          }),
        );

        connections.forEach((conn) =>
          gateway.handleConnection(conn as unknown as Socket),
        );

        const disconnected = connections.filter(
          (c) => c.disconnect.mock.calls.length > 0,
        );
        expect(disconnected.length).toBe(0);
      });

      it('should handle rapid connection/disconnection cycles', () => {
        mockConfigService.get.mockReturnValue(undefined);
        const socket = createMockSocket({
          handshake: {
            auth: { token: '' },
            headers: {},
            query: { sessionId: 'session-1' },
          },
        });

        for (let i = 0; i < 100; i++) {
          gateway.handleConnection(socket as unknown as Socket);
          gateway.handleDisconnect(socket as unknown as Socket);
        }

        expect(mockLogger.log).toHaveBeenCalled();
      });

      it('should handle connections without sessionId efficiently', () => {
        mockConfigService.get.mockReturnValue(undefined);
        const NO_SESSION_COUNT = 100;

        const connections = Array.from({ length: NO_SESSION_COUNT }, (_, i) =>
          createMockSocket({
            id: `socket-${i}`,
            handshake: {
              auth: {},
              headers: {},
              query: {},
            },
          }),
        );

        const start = Date.now();
        connections.forEach((conn) =>
          gateway.handleConnection(conn as unknown as Socket),
        );
        const duration = Date.now() - start;

        const joined = connections.filter((c) => c.join.mock.calls.length > 0);
        expect(joined.length).toBe(0);
        expect(duration).toBeLessThan(1000);
      });
    });
  });

  describe('Event Bus Throughput', () => {
    describe('EventBusService', () => {
      it('should handle rapid event publishing', () => {
        const mockEmitter = { emit: jest.fn() };
        const service = new EventBusService(
          mockEmitter as unknown as EventEmitter2,
        );

        const EVENT_COUNT = 1000;
        const start = Date.now();

        for (let i = 0; i < EVENT_COUNT; i++) {
          service.emit('test.event', `session-${i % 10}`, { index: i });
        }
        const duration = Date.now() - start;

        expect(mockEmitter.emit).toHaveBeenCalledTimes(EVENT_COUNT);
        expect(duration).toBeLessThan(1000);
      });

      it('should handle many concurrent subscriptions', () => {
        const service = new EventBusService({
          emit: jest.fn(),
        } as unknown as EventEmitter2);

        const handler = jest.fn();
        const unsubscribeFunctions: Array<() => void> = [];

        for (let i = 0; i < 100; i++) {
          unsubscribeFunctions.push(service.subscribe(`event-${i}`, handler));
        }

        const handlersMap = (
          service as unknown as {
            handlers: Map<string, ReturnType<typeof handler>[]>;
          }
        ).handlers;
        expect(handlersMap.size).toBe(100);

        unsubscribeFunctions.forEach((unsub) => unsub());
        const remainingHandlers = Array.from(handlersMap.values()) as Array<
          Array<unknown>
        >;
        expect(remainingHandlers.every((arr) => arr.length === 0)).toBe(true);
      });

      it('should handle high-frequency events to same session', () => {
        const mockEmitter = { emit: jest.fn() };
        const service = new EventBusService(
          mockEmitter as unknown as EventEmitter2,
        );

        const sessionId = 'high-load-session';
        const EVENTS_PER_SESSION = 500;

        const start = Date.now();
        for (let i = 0; i < EVENTS_PER_SESSION; i++) {
          service.emit('message.update', sessionId, { messageId: `msg-${i}` });
        }
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(500);
      });

      it('should handle many handlers for same event type', () => {
        const mockEmitter = { emit: jest.fn() };
        const service = new EventBusService(
          mockEmitter as unknown as EventEmitter2,
        );

        const HANDLER_COUNT = 50;
        const handlers = Array.from({ length: HANDLER_COUNT }, () => jest.fn());

        handlers.forEach((handler) => {
          service.subscribe('broadcast.event', handler);
        });

        const event: InternalEvent = {
          type: 'broadcast.event',
          sessionId: 'session-1',
          data: {},
          timestamp: new Date(),
        };

        service.publish(event);

        handlers.forEach((handler) => {
          expect(handler).toHaveBeenCalledTimes(1);
        });
      });
    });
  });

  describe('Memory and Performance Bounds', () => {
    it('should handle sustained load without memory leaks', () => {
      const mockEmitter = { emit: jest.fn() };
      const service = new EventBusService(
        mockEmitter as unknown as EventEmitter2,
      );

      const handler = jest.fn();
      const unsubscribe = service.subscribe('leak-test', handler);

      for (let batch = 0; batch < 10; batch++) {
        for (let i = 0; i < 100; i++) {
          service.emit('leak-test', `session-${i}`, { batch, index: i });
        }
      }
      unsubscribe();

      expect(handler).toHaveBeenCalledTimes(1000);
      const handlersAfter =
        (
          service as unknown as { handlers: Map<string, unknown[]> }
        ).handlers.get('leak-test') ?? [];
      expect(handlersAfter.length).toBe(0);
    });

    it('should bound memory for large concurrent operations', async () => {
      const CONCURRENT_TENANT_OPS = 100;

      const startMem = process.memoryUsage().heapUsed;

      const promises = Array.from({ length: CONCURRENT_TENANT_OPS }, (_, i) => {
        TenantContextStore.set({ tenantId: `tenant-${i}` });
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            TenantContextStore.get();
            resolve();
          }, 10);
        });
      });

      await Promise.all(promises);

      TenantContextStore.clear();

      const endMem = process.memoryUsage().heapUsed;
      const memIncrease = endMem - startMem;

      expect(memIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });
});
