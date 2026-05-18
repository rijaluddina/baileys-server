import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';

describe('AdminService', () => {
  let service: AdminService;
  let mockPrisma: {
    tenant: { findMany: jest.Mock };
    session: { findMany: jest.Mock };
  };
  let mockQueueService: {
    getQueueMetrics: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tenant-1',
            name: 'Test Tenant',
            active: true,
            maxSessions: 5,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
      session: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tenant-1:session-1',
            status: 'open',
            userJid: 'user@test.com',
            userName: 'Test User',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
    };

    mockQueueService = {
      getQueueMetrics: jest.fn().mockResolvedValue({
        messageStore: { waiting: 0, active: 0, completed: 10, failed: 0 },
        contactSync: { waiting: 0, active: 0, completed: 5, failed: 0 },
        chatSync: { waiting: 0, active: 0, completed: 3, failed: 0 },
        historySync: { waiting: 0, active: 0, completed: 0, failed: 0 },
        webhookDelivery: { waiting: 1, active: 0, completed: 20, failed: 2 },
        messageCleanup: { waiting: 0, active: 0, completed: 1, failed: 0 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllTenants', () => {
    it('should return all tenants', async () => {
      const result = await service.getAllTenants();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tenant-1');
      expect(mockPrisma.tenant.findMany).toHaveBeenCalled();
    });
  });

  describe('getAllSessions', () => {
    it('should return all sessions without tenant filter', async () => {
      const result = await service.getAllSessions();
      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBe('tenant-1:session-1');
      expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('should filter sessions by tenantId', async () => {
      await service.getAllSessions('tenant-1');
      expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { startsWith: 'tenant-1:' } },
        }),
      );
    });
  });

  describe('getSystemMetrics', () => {
    it('should return system metrics', () => {
      const result = service.getSystemMetrics();
      expect(result).toHaveProperty('cpu');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('platform');
      expect(result.memory).toHaveProperty('usagePercent');
    });
  });

  describe('getQueueMetrics', () => {
    it('should return queue metrics', async () => {
      const result = await service.getQueueMetrics();
      expect(result.messageStore.completed).toBe(10);
      expect(result.webhookDelivery.waiting).toBe(1);
      expect(result.webhookDelivery.failed).toBe(2);
    });
  });
});
