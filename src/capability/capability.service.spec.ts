import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CapabilityService } from './capability.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  Capability,
  SessionType,
  DEFAULT_CAPABILITIES_PER_SESSION_TYPE,
} from './capability.definitions.js';

describe('CapabilityService', () => {
  let service: CapabilityService;
  let prisma: { session: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      session: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<CapabilityService>(CapabilityService);
  });

  afterEach(() => {
    service.clearCache();
    jest.restoreAllMocks();
  });

  describe('getCapabilitiesForSession', () => {
    it('should return default capabilities for existing session', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'session-1' });

      const capabilities = await service.getCapabilitiesForSession('session-1');

      expect(capabilities).toEqual(
        DEFAULT_CAPABILITIES_PER_SESSION_TYPE[SessionType.STANDARD],
      );
    });

    it('should throw NotFoundException for non-existent session', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(
        service.getCapabilitiesForSession('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return cached capabilities on subsequent calls', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'session-1' });

      const first = await service.getCapabilitiesForSession('session-1');
      const second = await service.getCapabilitiesForSession('session-1');

      expect(prisma.session.findUnique).toHaveBeenCalledTimes(1);
      expect(first).toEqual(second);
    });
  });

  describe('hasCapability', () => {
    it('should return true when session has the capability', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'session-1' });

      const result = await service.hasCapability(
        'session-1',
        Capability.SEND_MESSAGE,
      );

      expect(result).toBe(true);
    });

    it('should return false when session does not have the capability', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'session-1' });

      const result = await service.hasCapability(
        'session-1',
        Capability.MAKE_CALL,
      );

      expect(result).toBe(false);
    });
  });

  describe('enableCapability', () => {
    it('should add capability to session', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'session-1' });

      const capabilities = await service.enableCapability(
        'session-1',
        Capability.CREATE_GROUP,
      );

      expect(capabilities).toContain(Capability.CREATE_GROUP);
    });

    it('should not duplicate capability if already enabled', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'session-1' });

      await service.enableCapability('session-1', Capability.SEND_MESSAGE);
      await service.enableCapability('session-1', Capability.SEND_MESSAGE);

      const caps = await service.getCapabilitiesForSession('session-1');
      expect(
        caps.filter((c) => c === (Capability.SEND_MESSAGE as string)).length,
      ).toBe(1);
    });
  });

  describe('disableCapability', () => {
    it('should remove capability from session', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'session-1' });

      await service.enableCapability('session-1', Capability.SEND_MESSAGE);
      const capabilities = service.disableCapability(
        'session-1',
        Capability.SEND_MESSAGE,
      );

      expect(capabilities).not.toContain(Capability.SEND_MESSAGE);
    });

    it('should throw NotFoundException for non-existent session', () => {
      expect(() =>
        service.disableCapability('non-existent', Capability.SEND_MESSAGE),
      ).toThrow(NotFoundException);
    });
  });

  describe('clearCache', () => {
    it('should clear specific session cache', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'session-1' });

      await service.getCapabilitiesForSession('session-1');
      expect(service['sessionCapabilities'].has('session-1')).toBe(true);

      service.clearCache('session-1');
      expect(service['sessionCapabilities'].has('session-1')).toBe(false);
    });

    it('should clear all cache when no sessionId provided', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'session-1' });

      await service.getCapabilitiesForSession('session-1');
      service.clearCache();

      expect(service['sessionCapabilities'].size).toBe(0);
    });
  });
});
