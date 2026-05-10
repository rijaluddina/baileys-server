import type { Request } from 'express';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

export interface RequestWithTenant extends Request {
  tenantContext?: TenantContext;
}

export function createTenantContext(request: Request): TenantContext {
  return {
    tenantId: (request.headers['x-tenant-id'] as string) ?? 'default',
    userId: request.headers['x-user-id'] as string | undefined,
    ipAddress: request.ip ?? request.socket.remoteAddress,
    userAgent: request.headers['user-agent'],
    correlationId: request.headers['x-correlation-id'] as string | undefined,
  };
}
