import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service.js';

export type Capability =
  | 'messaging'
  | 'groups'
  | 'calls'
  | 'business'
  | 'newsletter'
  | 'presence'
  | 'privacy'
  | 'labels';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params?: Record<string, string>;
      body?: Record<string, string>;
    }>();
    const sessionId =
      request.params?.['sessionId'] ?? request.body?.['sessionId'];

    if (!sessionId) {
      return true;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new ForbiddenException('Session not found');
    }

    return true;
  }
}

export const RequireCapabilities = (...capabilities: Capability[]) =>
  SetMetadata('capability', capabilities);

export async function checkSessionCapability(
  sessionId: string,
  capability: Capability,
  prisma: PrismaService,
  cache: Cache,
): Promise<boolean> {
  const cacheKey = `capability:${sessionId}:${capability}`;
  const cached = await cache.get<boolean>(cacheKey).catch(() => null);
  if (cached !== null && cached !== undefined) return cached;

  const result = true;

  await cache.set(cacheKey, result).catch(() => {});
  return result;
}
