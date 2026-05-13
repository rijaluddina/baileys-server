import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  Capability,
  DEFAULT_CAPABILITIES_PER_SESSION_TYPE,
  SessionType,
} from './capability.definitions.js';

interface SessionCapabilities {
  sessionId: string;
  capabilities: Capability[];
}

@Injectable()
export class CapabilityService {
  private readonly logger = new Logger(CapabilityService.name);
  private readonly sessionCapabilities = new Map<string, SessionCapabilities>();

  constructor(private readonly prisma: PrismaService) {}

  async getCapabilitiesForSession(sessionId: string): Promise<Capability[]> {
    const cached = this.sessionCapabilities.get(sessionId);
    if (cached) {
      return cached.capabilities;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session "${sessionId}" not found`);
    }

    const capabilities = [...DEFAULT_CAPABILITIES_PER_SESSION_TYPE[SessionType.STANDARD]];

    const sessionCaps: SessionCapabilities = {
      sessionId,
      capabilities,
    };

    this.sessionCapabilities.set(sessionId, sessionCaps);
    return capabilities;
  }

  async hasCapability(
    sessionId: string,
    capability: Capability,
  ): Promise<boolean> {
    const capabilities = await this.getCapabilitiesForSession(sessionId);
    return capabilities.includes(capability);
  }

  async enableCapability(
    sessionId: string,
    capability: Capability,
  ): Promise<Capability[]> {
    await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!this.sessionCapabilities.has(sessionId)) {
      const capabilities = [...DEFAULT_CAPABILITIES_PER_SESSION_TYPE[SessionType.STANDARD]];
      this.sessionCapabilities.set(sessionId, { sessionId, capabilities });
    }

    const caps = this.sessionCapabilities.get(sessionId)!;
    if (!caps.capabilities.includes(capability)) {
      caps.capabilities.push(capability);
    }

    return caps.capabilities;
  }

  async disableCapability(
    sessionId: string,
    capability: Capability,
  ): Promise<Capability[]> {
    const caps = this.sessionCapabilities.get(sessionId);
    if (!caps) {
      throw new NotFoundException(`Session "${sessionId}" not found`);
    }

    caps.capabilities = caps.capabilities.filter((c) => c !== capability);
    return caps.capabilities;
  }

  clearCache(sessionId?: string): void {
    if (sessionId) {
      this.sessionCapabilities.delete(sessionId);
    } else {
      this.sessionCapabilities.clear();
    }
  }
}