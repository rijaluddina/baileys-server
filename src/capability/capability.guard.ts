import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Capability } from './capability.definitions.js';
import { CapabilityService } from './capability.service.js';

export const CAPABILITY_KEY = 'capabilities';

export const RequireCapability = (capability: Capability) =>
  SetMetadata(CAPABILITY_KEY, [capability]);

export const Capabilities = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITY_KEY, capabilities);

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly capabilityService: CapabilityService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredCapabilities = this.reflector.getAllAndOverride<Capability[]>(
      CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      params?: { sessionId?: string };
      body?: { sessionId?: string };
    }>();
    const sessionId = request.params?.sessionId || request.body?.sessionId;

    if (!sessionId) {
      throw new ForbiddenException('Session ID is required');
    }

    for (const capability of requiredCapabilities) {
      const hasCapability = await this.capabilityService.hasCapability(
        sessionId,
        capability,
      );

      if (!hasCapability) {
        throw new ForbiddenException(
          `Session "${sessionId}" does not have required capability: ${capability}`,
        );
      }
    }

    return true;
  }
}
