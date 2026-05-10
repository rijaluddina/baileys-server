import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request.headers['x-tenant-id'] as string) ?? 'default';
  },
);

export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.headers['x-user-id'] as string | undefined;
  },
);

export const CorrelationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.headers['x-correlation-id'] as string | undefined;
  },
);

export const TenantContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return {
      tenantId: (request.headers['x-tenant-id'] as string) ?? 'default',
      userId: request.headers['x-user-id'] as string | undefined,
      correlationId: request.headers['x-correlation-id'] as string | undefined,
      ipAddress: request.ip ?? request.socket?.remoteAddress,
      userAgent: request.headers['user-agent'],
    };
  },
);
