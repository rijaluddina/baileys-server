import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextStore } from '../common/tenant/tenant-context.store.js';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { tenant: { findUnique: jest.Mock } };
  let tenantContextStoreSet: jest.Mock;
  let tenantContextStoreSetNot: jest.Mock;

  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Tenant',
    active: true,
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn(),
      },
    };

    tenantContextStoreSet = jest.fn();
    tenantContextStoreSetNot = jest.fn();

    jest
      .spyOn(TenantContextStore, 'set')
      .mockImplementation(tenantContextStoreSet);
    jest
      .spyOn(TenantContextStore, 'set')
      .mockImplementation(tenantContextStoreSetNot);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateApiKey', () => {
    it('should return tenant info for valid API key', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);

      const result = await service.validateApiKey('valid-api-key');

      expect(result).toEqual({
        tenantId: 'tenant-123',
        tenantName: 'Test Tenant',
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(TenantContextStore.set).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
      });
    });

    it('should throw UnauthorizedException for invalid API key', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.validateApiKey('invalid-key')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for empty API key', async () => {
      await expect(service.validateApiKey('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for inactive tenant', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        ...mockTenant,
        active: false,
      });

      await expect(service.validateApiKey('valid-key')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateApiKeyWithoutContext', () => {
    it('should return tenant info without setting context', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);

      const result = await service.validateApiKeyWithoutContext('valid-key');

      expect(result).toEqual({
        tenantId: 'tenant-123',
        tenantName: 'Test Tenant',
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(TenantContextStore.set).not.toHaveBeenCalled();
    });

    it('should return null for invalid API key', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      const result = await service.validateApiKeyWithoutContext('invalid-key');

      expect(result).toBeNull();
    });

    it('should return null for inactive tenant', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        ...mockTenant,
        active: false,
      });

      const result = await service.validateApiKeyWithoutContext('valid-key');

      expect(result).toBeNull();
    });

    it('should return null for empty API key', async () => {
      const result = await service.validateApiKeyWithoutContext('');

      expect(result).toBeNull();
    });
  });
});
