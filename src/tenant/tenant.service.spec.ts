import { NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('TenantService', () => {
  let service: TenantService;
  let mockPrisma: {
    tenant: {
      findUnique: jest.Mock<Promise<unknown>>;
      findMany: jest.Mock<Promise<unknown[]>>;
      create: jest.Mock<Promise<unknown>>;
      update: jest.Mock<Promise<unknown>>;
      delete: jest.Mock<Promise<unknown>>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findUnique: jest.fn<Promise<unknown>, [unknown]>(),
        findMany: jest.fn<Promise<unknown[]>, [unknown]>(),
        create: jest.fn<Promise<unknown>, [unknown]>(),
        update: jest.fn<Promise<unknown>, [unknown]>(),
        delete: jest.fn<Promise<unknown>, [unknown]>(),
      },
    };
    service = new TenantService(mockPrisma as unknown as PrismaService);
  });

  const matching = <T>(val: Partial<T>): T => expect.objectContaining(val) as T;

  describe('findById', () => {
    it('should return tenant when found', async () => {
      const mockTenant = {
        id: 'tenant-123',
        name: 'Test Tenant',
        apiKey: 'tsk_abc123',
        webhookUrl: null,
        maxSessions: 1,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);

      const result = await service.findById('tenant-123');

      expect(result).toEqual(mockTenant);
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
      });
    });

    it('should throw NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByApiKey', () => {
    it('should return tenant when API key matches', async () => {
      const mockTenant = { id: 'tenant-123', apiKey: 'tsk_abc123' };
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);

      const result = await service.findByApiKey('tsk_abc123');

      expect(result).toEqual(mockTenant);
    });

    it('should return null when API key not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      const result = await service.findByApiKey('invalid-key');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new tenant', async () => {
      const createDto = { name: 'New Tenant', maxSessions: 5 };
      const mockTenant: Record<string, unknown> = {
        id: 'tenant-456',
        name: 'New Tenant',
        apiKey: 'tsk_generated',
        webhookUrl: null,
        maxSessions: 5,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.tenant.create.mockResolvedValue(mockTenant);

      const result = await service.create(createDto);

      expect(result.name).toBe('New Tenant');
      expect(result.apiKey).toMatch(/^tsk_/);
      expect(mockPrisma.tenant.create).toHaveBeenCalledWith({
        data: matching({
          name: 'New Tenant',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          apiKey: expect.stringMatching(/^tsk_/),
          webhookUrl: undefined,
          maxSessions: 5,
        }),
      });
    });

    it('should create tenant with webhook URL', async () => {
      const createDto = {
        name: 'Test Tenant',
        webhookUrl: 'https://example.com/webhook',
      };
      mockPrisma.tenant.create.mockResolvedValue({
        ...createDto,
        id: 'tenant-789',
        apiKey: 'tsk_abc',
        maxSessions: 1,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(createDto);

      expect(result.webhookUrl).toBe('https://example.com/webhook');
    });
  });

  describe('update', () => {
    it('should update tenant properties', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-123' });
      const updateDto = { name: 'Updated Name', active: false };
      const mockUpdated = {
        id: 'tenant-123',
        name: 'Updated Name',
        apiKey: 'tsk_abc',
        active: false,
      };
      mockPrisma.tenant.update.mockResolvedValue(mockUpdated);

      const result = await service.update('tenant-123', updateDto);

      expect(result.name).toBe('Updated Name');
      expect(result.active).toBe(false);
    });

    it('should throw NotFoundException when updating non-existent tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all tenants', async () => {
      const mockTenants = [
        { id: 'tenant-1', name: 'Tenant 1', apiKey: 'tsk_1' },
        { id: 'tenant-2', name: 'Tenant 2', apiKey: 'tsk_2' },
      ];
      mockPrisma.tenant.findMany.mockResolvedValue(mockTenants);

      const result = await service.findAll();

      expect(result).toEqual(mockTenants);
    });

    it('should return empty array when no tenants exist', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete tenant successfully', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-123' });
      mockPrisma.tenant.delete.mockResolvedValue(undefined);

      const result = await service.delete('tenant-123');

      expect(result).toEqual({ id: 'tenant-123', status: 'deleted' });
      expect(mockPrisma.tenant.delete).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
      });
    });

    it('should throw NotFoundException when deleting non-existent tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.delete('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
