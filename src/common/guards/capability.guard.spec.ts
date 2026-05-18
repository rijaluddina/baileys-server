/* eslint-disable @typescript-eslint/unbound-method */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { CapabilityGuard, checkSessionCapability } from './capability.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('CapabilityGuard', () => {
  const handler = jest.fn();
  class TestController {}

  function createContext(
    params: Record<string, string> = {},
    body: Record<string, string> = {},
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({ params, body }),
      }),
    } as unknown as ExecutionContext;
  }

  function createPrismaMock(session: unknown) {
    return {
      session: {
        findUnique: jest.fn().mockResolvedValue(session),
      },
    } as unknown as PrismaService;
  }

  describe('canActivate', () => {
    it('should return true when no sessionId in request', async () => {
      const prisma = createPrismaMock(null);
      const guard = new CapabilityGuard(prisma);

      const result = await guard.canActivate(createContext({}, {}));
      expect(result).toBe(true);
    });

    it('should allow when session exists in DB', async () => {
      const session = { id: 'session-123', name: 'Test Session' };
      const prisma = createPrismaMock(session);
      const guard = new CapabilityGuard(prisma);

      const result = await guard.canActivate(
        createContext({ sessionId: 'session-123' }, {}),
      );
      expect(result).toBe(true);
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-123' },
      });
    });

    it('should throw ForbiddenException when session not found', async () => {
      const prisma = createPrismaMock(null);
      const guard = new CapabilityGuard(prisma);

      await expect(
        guard.canActivate(createContext({ sessionId: 'invalid' }, {})),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        guard.canActivate(createContext({ sessionId: 'invalid' }, {})),
      ).rejects.toThrow('Session not found');
    });

    it('should extract sessionId from params', async () => {
      const session = { id: 'session-from-params' };
      const prisma = createPrismaMock(session);
      const guard = new CapabilityGuard(prisma);

      const result = await guard.canActivate(
        createContext(
          { sessionId: 'session-from-params' },
          { sessionId: 'other' },
        ),
      );
      expect(result).toBe(true);
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-from-params' },
      });
    });

    it('should extract sessionId from body when not in params', async () => {
      const session = { id: 'session-from-body' };
      const prisma = createPrismaMock(session);
      const guard = new CapabilityGuard(prisma);

      const result = await guard.canActivate(
        createContext({}, { sessionId: 'session-from-body' }),
      );
      expect(result).toBe(true);
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-from-body' },
      });
    });

    it('should prefer params over body for sessionId', async () => {
      const session = { id: 'from-params' };
      const prisma = createPrismaMock(session);
      const guard = new CapabilityGuard(prisma);

      await guard.canActivate(
        createContext({ sessionId: 'from-params' }, { sessionId: 'from-body' }),
      );
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'from-params' },
      });
    });
  });
});

describe('checkSessionCapability', () => {
  function createCacheMock(
    getValue: unknown,
    getError = false,
    setError = false,
  ) {
    return {
      get: jest.fn().mockImplementation(() => {
        if (getError) return Promise.reject(new Error('Cache error'));
        return Promise.resolve(getValue);
      }),
      set: jest.fn().mockImplementation(() => {
        if (setError) return Promise.reject(new Error('Cache set error'));
        return Promise.resolve();
      }),
    };
  }

  it('should return cached value when cache hit', async () => {
    const cache = createCacheMock(true);
    const prisma = {} as PrismaService;

    const result = await checkSessionCapability(
      'session-123',
      'messaging',
      prisma,
      cache as unknown as Cache,
    );

    expect(result).toBe(true);
    expect(cache.get).toHaveBeenCalledWith('capability:session-123:messaging');
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('should query and cache result on cache miss', async () => {
    const cache = createCacheMock(undefined);
    const prisma = {} as PrismaService;

    const result = await checkSessionCapability(
      'session-123',
      'messaging',
      prisma,
      cache as unknown as Cache,
    );

    expect(result).toBe(true);
    expect(cache.get).toHaveBeenCalledWith('capability:session-123:messaging');
    expect(cache.set).toHaveBeenCalledWith(
      'capability:session-123:messaging',
      true,
    );
  });

  it('should handle cache get error gracefully', async () => {
    const cache = createCacheMock(null, true);
    const prisma = {} as PrismaService;

    const result = await checkSessionCapability(
      'session-123',
      'messaging',
      prisma,
      cache as unknown as Cache,
    );

    expect(result).toBe(true);
  });

  it('should handle cache set error gracefully', async () => {
    const cache = createCacheMock(null, false, true);
    const prisma = {} as PrismaService;

    const result = await checkSessionCapability(
      'session-123',
      'messaging',
      prisma,
      cache as unknown as Cache,
    );

    expect(result).toBe(true);
  });

  it('should return false for cached false value', async () => {
    const cache = createCacheMock(false);
    const prisma = {} as PrismaService;

    const result = await checkSessionCapability(
      'session-123',
      'messaging',
      prisma,
      cache as unknown as Cache,
    );

    expect(result).toBe(false);
    expect(cache.set).not.toHaveBeenCalled();
  });
});
