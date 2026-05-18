import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtGuard, JwtPayload } from './jwt.guard.js';

type MockConfigService = Pick<ConfigService, 'get'>;

describe('JwtGuard', () => {
  const handler = jest.fn();
  class TestController {}

  function createContext(
    headers: Record<string, string | undefined> = {},
  ): ExecutionContext {
    const request = { headers, user: undefined as JwtPayload | undefined };
    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  function createJwtToken(payload: Partial<JwtPayload>, exp?: number): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64');
    const payloadStr = Buffer.from(
      JSON.stringify({
        ...payload,
        exp: exp ?? Date.now() / 1000 + 3600,
      }),
    ).toString('base64');
    const signature = 'test-signature';
    return `${header}.${payloadStr}.${signature}`;
  }

  function createGuard() {
    const configService: MockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    return {
      guard: new JwtGuard(configService as ConfigService),
      configService,
    };
  }

  describe('canActivate', () => {
    it('allows requests with valid JWT', () => {
      const { guard } = createGuard();
      const token = createJwtToken({
        sub: 'user-123',
        email: 'test@example.com',
      });
      const context = createContext({ authorization: `Bearer ${token}` });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows requests with valid JWT and tenantId', () => {
      const { guard } = createGuard();
      const token = createJwtToken({ sub: 'user-123', tenantId: 'tenant-abc' });
      const context = createContext({ authorization: `Bearer ${token}` });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects expired JWT', () => {
      const { guard } = createGuard();
      const expiredExp = Date.now() / 1000 - 3600;
      const token = createJwtToken({ sub: 'user-123' }, expiredExp);
      const context = createContext({ authorization: `Bearer ${token}` });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Token expired'),
      );
    });

    it('rejects malformed JWT with wrong part count', () => {
      const { guard } = createGuard();
      const context = createContext({ authorization: 'Bearer invalid.token' });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Invalid token format'),
      );
    });

    it('rejects missing authorization header', () => {
      const { guard } = createGuard();
      const context = createContext({});

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Missing authorization token'),
      );
    });

    it('rejects authorization header without Bearer prefix', () => {
      const { guard } = createGuard();
      const token = createJwtToken({ sub: 'user-123' });
      const context = createContext({ authorization: token });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Missing authorization token'),
      );
    });

    it('rejects tampered JWT with invalid base64 in payload', () => {
      const { guard } = createGuard();
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64');
      const tamperedPayload = Buffer.from('not-valid-json{').toString('base64');
      const signature = 'test-signature';
      const token = `${header}.${tamperedPayload}.${signature}`;
      const context = createContext({ authorization: `Bearer ${token}` });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Invalid token'),
      );
    });

    it('allows JWT without expiration claim', () => {
      const { guard } = createGuard();
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64');
      const payloadWithoutExp = Buffer.from(
        JSON.stringify({ sub: 'user-no-exp' }),
      ).toString('base64');
      const token = `${header}.${payloadWithoutExp}.test-signature`;
      const context = createContext({ authorization: `Bearer ${token}` });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('extracts and sets user payload from decoded JWT', () => {
      const { guard } = createGuard();
      const payload: Partial<JwtPayload> = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant-abc',
      };
      const token = createJwtToken(payload);
      const context = createContext({ authorization: `Bearer ${token}` });

      guard.canActivate(context);

      const request = context
        .switchToHttp()
        .getRequest<{ user?: JwtPayload }>();
      expect(request.user).toMatchObject(payload);
    });
  });

  describe('verifyToken', () => {
    it('decodes valid JWT payload correctly', () => {
      const { guard } = createGuard();
      const payload: Partial<JwtPayload> = {
        sub: 'user-456',
        email: 'another@example.com',
        role: 'user',
      };
      const token = createJwtToken(payload);

      const context = createContext({ authorization: `Bearer ${token}` });
      guard.canActivate(context);

      const request = context
        .switchToHttp()
        .getRequest<{ user?: JwtPayload }>();
      expect(request.user?.sub).toBe('user-456');
      expect(request.user?.email).toBe('another@example.com');
      expect(request.user?.role).toBe('user');
    });

    it('throws on JWT with only two parts', () => {
      const { guard } = createGuard();
      const context = createContext({ authorization: 'Bearer part1.part2' });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Invalid token format'),
      );
    });

    it('throws on JWT with four parts', () => {
      const { guard } = createGuard();
      const context = createContext({
        authorization: 'Bearer part1.part2.part3.part4',
      });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Invalid token format'),
      );
    });
  });
});
