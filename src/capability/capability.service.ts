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

  async getCapabilitiesForSession(sessionId: string): Promise<string[]> {
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

    const capabilities = [
      ...DEFAULT_CAPABILITIES_PER_SESSION_TYPE[SessionType.STANDARD],
    ] as string[];

    const sessionCaps: SessionCapabilities = {
      sessionId,
      capabilities: capabilities as Capability[],
    };

    this.sessionCapabilities.set(sessionId, sessionCaps);
    return capabilities;
  }

  async hasCapability(sessionId: string, capability: string): Promise<boolean> {
    const capabilities = await this.getCapabilitiesForSession(sessionId);
    return capabilities.some(
      (c) => c === capability || c === capability.toUpperCase(),
    );
  }

  async enableCapability(
    sessionId: string,
    capability: string,
  ): Promise<string[]> {
    await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!this.sessionCapabilities.has(sessionId)) {
      const capabilities = [
        ...DEFAULT_CAPABILITIES_PER_SESSION_TYPE[SessionType.STANDARD],
      ];
      this.sessionCapabilities.set(sessionId, { sessionId, capabilities });
    }

    const caps = this.sessionCapabilities.get(sessionId)!;
    const cap = capability as Capability;
    if (!caps.capabilities.includes(cap)) {
      caps.capabilities.push(cap);
    }

    return caps.capabilities;
  }

  disableCapability(sessionId: string, capability: string): string[] {
    const caps = this.sessionCapabilities.get(sessionId);
    if (!caps) {
      throw new NotFoundException(`Session "${sessionId}" not found`);
    }

    const cap = capability as Capability;
    caps.capabilities = caps.capabilities.filter((c) => c !== cap);
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
