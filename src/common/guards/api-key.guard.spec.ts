import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const handler = jest.fn();
  class TestController {}

  function createContext(headers: Record<string, string | undefined> = {}): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as ExecutionContext;
  }

  function createGuard(options: { configuredKey?: string; isPublic?: boolean }) {
    const configService = {
      get: jest.fn().mockReturnValue(options.configuredKey),
    };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(options.isPublic ?? false),
    };

    return {
      guard: new ApiKeyGuard(configService as never, reflector as never),
      configService,
      reflector,
    };
  }

  it('allows public routes without checking API key configuration', () => {
    const { guard, configService } = createGuard({ configuredKey: 'secret', isPublic: true });

    expect(guard.canActivate(createContext())).toBe(true);
    expect(configService.get).not.toHaveBeenCalled();
  });

  it('allows requests when no API key is configured', () => {
    const { guard } = createGuard({});

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('rejects requests without an API key when one is configured', () => {
    const { guard } = createGuard({ configuredKey: 'secret' });

    expect(() => guard.canActivate(createContext())).toThrow(
      new UnauthorizedException('API key is required'),
    );
  });

  it('rejects requests with the wrong API key', () => {
    const { guard } = createGuard({ configuredKey: 'secret' });

    expect(() => guard.canActivate(createContext({ 'x-api-key': 'wrong' }))).toThrow(
      new UnauthorizedException('Invalid API key'),
    );
  });

  it('allows requests with the configured API key', () => {
    const { guard } = createGuard({ configuredKey: 'secret' });

    expect(guard.canActivate(createContext({ 'x-api-key': 'secret' }))).toBe(true);
  });
});
