import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { AuthService, ValidatedTenant } from '../auth.service.js';

describe('AuthGuard', () => {
  const handler = jest.fn();
  class TestController {}

  let authService: {
    validateApiKey: jest.Mock;
    validateApiKeyWithoutContext: jest.Mock;
  };
  let reflector: {
    getAllAndOverride: jest.Mock;
  };
  let guard: AuthGuard;

  const mockValidatedTenant: ValidatedTenant = {
    tenantId: 'tenant-123',
    tenantName: 'Test Tenant',
  };

  function createContext(
    headers: Record<string, string | undefined> = {},
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          tenant: undefined as ValidatedTenant | undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    authService = {
      validateApiKey: jest.fn(),
      validateApiKeyWithoutContext: jest.fn(),
    };

    reflector = {
      getAllAndOverride: jest.fn(),
    };

    guard = new AuthGuard(
      authService as unknown as AuthService,
      reflector as unknown as Reflector,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    describe('@Public() route bypass', () => {
      it('should bypass auth when @Public() decorator is present', async () => {
        reflector.getAllAndOverride.mockReturnValue(true);

        const context = createContext({ 'x-api-key': 'any-key' });
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(authService.validateApiKey).not.toHaveBeenCalled();
      });

      it('should bypass auth when @Public() is set on controller', async () => {
        reflector.getAllAndOverride.mockReturnValue(true);

        const context = createContext({});
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(authService.validateApiKey).not.toHaveBeenCalled();
      });
    });

    describe('valid API key', () => {
      it('should allow request with valid API key', async () => {
        reflector.getAllAndOverride.mockReturnValue(false);
        authService.validateApiKey.mockResolvedValue(mockValidatedTenant);

        const context = createContext({ 'x-api-key': 'valid-api-key' });
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(authService.validateApiKey).toHaveBeenCalledWith(
          'valid-api-key',
        );
      });

      it('should attach validated tenant to request', async () => {
        reflector.getAllAndOverride.mockReturnValue(false);
        authService.validateApiKey.mockResolvedValue(mockValidatedTenant);

        const request = {
          headers: { 'x-api-key': 'valid-key' },
          tenant: undefined as ValidatedTenant | undefined,
        };
        const context = {
          getHandler: () => handler,
          getClass: () => TestController,
          switchToHttp: () => ({
            getRequest: () => request,
          }),
        } as unknown as ExecutionContext;

        await guard.canActivate(context);

        expect(request.tenant).toEqual(mockValidatedTenant);
      });
    });

    describe('missing API key', () => {
      it('should throw UnauthorizedException when no API key header', async () => {
        reflector.getAllAndOverride.mockReturnValue(false);

        const context = createContext({});
        await expect(guard.canActivate(context)).rejects.toThrow(
          new UnauthorizedException('API key is required'),
        );
      });

      it('should throw UnauthorizedException when API key is empty string', async () => {
        reflector.getAllAndOverride.mockReturnValue(false);

        const context = createContext({ 'x-api-key': '' });
        await expect(guard.canActivate(context)).rejects.toThrow(
          new UnauthorizedException('API key is required'),
        );
      });
    });

    describe('invalid API key', () => {
      it('should throw UnauthorizedException for invalid API key', async () => {
        reflector.getAllAndOverride.mockReturnValue(false);
        authService.validateApiKey.mockRejectedValue(
          new UnauthorizedException('Invalid API key'),
        );

        const context = createContext({ 'x-api-key': 'invalid-key' });
        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('should throw UnauthorizedException with generic message for non-UnauthorizedException errors', async () => {
        reflector.getAllAndOverride.mockReturnValue(false);
        authService.validateApiKey.mockRejectedValue(
          new Error('Some internal error'),
        );

        const context = createContext({ 'x-api-key': 'tampered-key' });
        await expect(guard.canActivate(context)).rejects.toThrow(
          new UnauthorizedException('Invalid API key'),
        );
      });

      it('should throw original UnauthorizedException when service throws it', async () => {
        reflector.getAllAndOverride.mockReturnValue(false);
        const originalError = new UnauthorizedException(
          'API key has been revoked',
        );
        authService.validateApiKey.mockRejectedValue(originalError);

        const context = createContext({ 'x-api-key': 'revoked-key' });
        await expect(guard.canActivate(context)).rejects.toThrow(
          'API key has been revoked',
        );
      });
    });

    describe('inactive tenant / disabled API key', () => {
      it('should throw for inactive tenant', async () => {
        reflector.getAllAndOverride.mockReturnValue(false);
        authService.validateApiKey.mockRejectedValue(
          new UnauthorizedException('Tenant is not active'),
        );

        const context = createContext({ 'x-api-key': 'inactive-tenant-key' });
        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      });
    });

    describe('wrong tenant / tenant mismatch', () => {
      it('should throw when API key belongs to different tenant', async () => {
        reflector.getAllAndOverride.mockReturnValue(false);
        authService.validateApiKey.mockRejectedValue(
          new UnauthorizedException('API key does not match tenant'),
        );

        const context = createContext({
          'x-api-key': 'key-from-different-tenant',
        });
        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      });
    });
  });
});
