import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyService } from './api-key.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let mockPrisma: { apiKey: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    mockPrisma = {
      apiKey: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  describe('generateKey', () => {
    it('should generate a key with correct format', async () => {
      const key = await service.generateKey('tenant-123', 'test-key');
      expect(key).toMatch(/^wa_live_[a-zA-Z0-9]{32}$/);
      expect(key.length).toBe(40);
    });

    it('should generate unique keys', async () => {
      const key1 = await service.generateKey('tenant-123', 'key-1');
      const key2 = await service.generateKey('tenant-123', 'key-2');
      expect(key1).not.toBe(key2);
    });

    it('should call mockPrisma.apiKey.create', async () => {
      await service.generateKey('tenant-123', 'test-key');
      expect(mockPrisma.apiKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-123',
          name: 'test-key',
          isActive: true,
        }),
      });
    });
  });

  describe('validateKey', () => {
    it('should return true for valid key format', () => {
      const validKey = 'wa_live_' + 'a'.repeat(32);
      expect(service.validateKey(validKey)).toBe(true);
    });

    it('should return false for key missing prefix', () => {
      expect(service.validateKey('invalid' + 'a'.repeat(32))).toBe(false);
    });

    it('should return false for key with wrong length', () => {
      expect(service.validateKey('wa_live_' + 'a'.repeat(31))).toBe(false);
      expect(service.validateKey('wa_live_' + 'a'.repeat(33))).toBe(false);
    });

    it('should return false for key with invalid characters', () => {
      expect(service.validateKey('wa_live_' + '!'.repeat(32))).toBe(false);
    });

    it('should return false for empty or non-string input', () => {
      expect(service.validateKey('')).toBe(false);
      expect(service.validateKey(null as any)).toBe(false);
      expect(service.validateKey(undefined as any)).toBe(false);
    });
  });

  describe('rotateKey', () => {
    it('should deactivate old key and create new key', async () => {
      (mockPrisma.apiKey.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'key-1',
        tenantId: 'tenant-123',
        name: 'test-key',
        isActive: true,
      });

      const newKey = await service.rotateKey('key-1');

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { isActive: false },
      });
      expect(mockPrisma.apiKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-123',
          name: 'test-key',
          isActive: true,
        }),
      });
      expect(newKey).toMatch(/^wa_live_[a-zA-Z0-9]{32}$/);
    });

    it('should throw error if key not found', async () => {
      (mockPrisma.apiKey.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.rotateKey('non-existent')).rejects.toThrow('API key not found');
    });
  });

  describe('deactivateKey', () => {
    it('should set isActive to false', async () => {
      await service.deactivateKey('key-1');
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { isActive: false },
      });
    });
  });
});