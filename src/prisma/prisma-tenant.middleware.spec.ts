import { PrismaTenantMiddleware } from './prisma-tenant.middleware.js';

type MiddlewareParams = Parameters<PrismaTenantMiddleware['execute']>[0];
type NextMock = jest.Mock<Promise<Record<string, unknown>>, [MiddlewareParams]>;

describe('PrismaTenantMiddleware', () => {
  let middleware: PrismaTenantMiddleware;

  beforeEach(() => {
    middleware = new PrismaTenantMiddleware();
  });

  const createMockParams = (overrides: {
    model?: string;
    action?: string;
    args?: Record<string, unknown>;
  }): MiddlewareParams => ({
    model: overrides.model || 'Message',
    action: overrides.action || 'findMany',
    args: overrides.args || {},
  });

  const createNextMock = (): NextMock =>
    jest
      .fn<Promise<Record<string, unknown>>, [MiddlewareParams]>()
      .mockResolvedValue({});

  const matching = <T>(val: Partial<T>): T => expect.objectContaining(val) as T;

  describe('findMany', () => {
    it('should inject tenantId into where clause', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'findMany',
        args: { where: { content: 'test' }, tenantId: 'session-123' },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      expect(next).toHaveBeenCalledWith(
        matching<MiddlewareParams>({
          args: matching<Record<string, unknown>>({
            where: matching<Record<string, unknown>>({
              content: 'test',
              tenantId: 'session-123',
            }),
          }),
        }),
      );
    });

    it('should create where clause with tenantId if not present', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'findMany',
        args: { select: { id: true }, tenantId: 'session-123' },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      expect(next).toHaveBeenCalledWith(
        matching<MiddlewareParams>({
          args: matching<Record<string, unknown>>({
            where: { tenantId: 'session-123' },
          }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should inject tenantId into data', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'create',
        args: {
          data: {
            content: { text: 'hello' },
            sessionId: 'session-123',
            remoteJid: 'user@test.com',
          },
          tenantId: 'session-123',
        },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      expect(next).toHaveBeenCalledWith(
        matching<MiddlewareParams>({
          args: matching<Record<string, unknown>>({
            data: matching<Record<string, unknown>>({
              content: { text: 'hello' },
              sessionId: 'session-123',
              remoteJid: 'user@test.com',
              tenantId: 'session-123',
            }),
          }),
        }),
      );
    });

    it('should remove tenantId from data if present', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'create',
        args: {
          data: {
            content: { text: 'hello' },
            tenantId: 'malicious-tenant',
          },
          tenantId: 'session-123',
        },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      const calledArgs = next.mock.calls[0][0].args;
      expect(calledArgs.data.tenantId).toBe('session-123');
    });
  });

  describe('update', () => {
    it('should inject tenantId into where clause', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'update',
        args: {
          where: { id: 'msg-1' },
          data: { content: { text: 'updated' } },
          tenantId: 'session-123',
        },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      expect(next).toHaveBeenCalledWith(
        matching<MiddlewareParams>({
          args: matching<Record<string, unknown>>({
            where: matching<Record<string, unknown>>({
              id: 'msg-1',
              tenantId: 'session-123',
            }),
          }),
        }),
      );
    });

    it('should remove tenantId from data', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'update',
        args: {
          where: { id: 'msg-1' },
          data: { content: { text: 'updated' }, tenantId: 'malicious' },
          tenantId: 'session-123',
        },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      const calledArgs = next.mock.calls[0][0].args;
      expect(calledArgs.data.tenantId).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should inject tenantId into where clause', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'delete',
        args: {
          where: { id: 'msg-1' },
          tenantId: 'session-123',
        },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      expect(next).toHaveBeenCalledWith(
        matching<MiddlewareParams>({
          args: matching<Record<string, unknown>>({
            where: matching<Record<string, unknown>>({
              id: 'msg-1',
              tenantId: 'session-123',
            }),
          }),
        }),
      );
    });
  });

  describe('upsert', () => {
    it('should inject tenantId into both where and create data', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'upsert',
        args: {
          where: { id: 'msg-1' },
          create: {
            content: { text: 'created' },
            sessionId: 'session-123',
            remoteJid: 'user@test.com',
          },
          update: { content: { text: 'updated' } },
          tenantId: 'session-123',
        },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      expect(next).toHaveBeenCalledWith(
        matching<MiddlewareParams>({
          args: matching<Record<string, unknown>>({
            where: matching<Record<string, unknown>>({
              id: 'msg-1',
              tenantId: 'session-123',
            }),
            create: matching<Record<string, unknown>>({
              content: { text: 'created' },
              sessionId: 'session-123',
              remoteJid: 'user@test.com',
              tenantId: 'session-123',
            }),
          }),
        }),
      );
    });
  });

  describe('non-scoped models', () => {
    it('should NOT inject tenantId for Session model', async () => {
      const params = createMockParams({
        model: 'Session',
        action: 'findMany',
        args: { where: { id: 'session-123' }, tenantId: 'session-123' },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      expect(next).toHaveBeenCalledWith(
        matching<MiddlewareParams>({
          args: matching<Record<string, unknown>>({
            where: { id: 'session-123' },
          }),
        }),
      );
    });

    it('should NOT inject tenantId for IdempotencyKey model', async () => {
      const params = createMockParams({
        model: 'IdempotencyKey',
        action: 'findMany',
        args: { where: { key: 'test-key' }, tenantId: 'session-123' },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      expect(next).toHaveBeenCalledWith(params);
    });
  });

  describe('cross-tenant blocking', () => {
    it('should block attempt to inject different tenantId via data', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'update',
        args: {
          where: { id: 'msg-1', tenantId: 'session-123' },
          data: { content: { text: 'updated' }, tenantId: 'other-tenant' },
          tenantId: 'session-123',
        },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      const calledArgs = next.mock.calls[0][0].args;
      expect(calledArgs.data.tenantId).toBeUndefined();
      expect(calledArgs.where.tenantId).toBe('session-123');
    });
  });

  describe('tenantId missing', () => {
    it('should pass through without injection when tenantId missing', async () => {
      const params = createMockParams({
        model: 'Message',
        action: 'findMany',
        args: { where: { id: 'msg-1' } },
      });
      const next = createNextMock();

      await middleware.execute(params, next);

      expect(next).toHaveBeenCalledWith(params);
    });
  });
});
