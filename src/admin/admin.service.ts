import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';
import os from 'os';

export interface TenantInfo {
  id: string;
  name: string;
  active: boolean;
  maxSessions: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionInfo {
  sessionId: string;
  status: string;
  userJid: string | null;
  userName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SystemMetrics {
  cpu: {
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  uptime: number;
  platform: string;
}

export interface QueueMetrics {
  messageStore: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  contactSync: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  chatSync: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  historySync: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  webhookDelivery: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  messageCleanup: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async getAllTenants(): Promise<TenantInfo[]> {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        active: true,
        maxSessions: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return tenants;
  }

  async getAllSessions(tenantId?: string): Promise<SessionInfo[]> {
    const where = tenantId ? { id: { startsWith: `${tenantId}:` } } : {};
    const sessions = await this.prisma.session.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        userJid: true,
        userName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return sessions.map((s) => ({
      sessionId: s.id,
      status: s.status,
      userJid: s.userJid,
      userName: s.userName,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      cpu: {
        loadAverage: os.loadavg(),
        cores: os.cpus().length,
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent: Math.round((usedMem / totalMem) * 100),
      },
      uptime: os.uptime(),
      platform: os.platform(),
    };
  }

  async getQueueMetrics(): Promise<QueueMetrics> {
    const metrics = await this.queueService.getQueueMetrics();
    return metrics;
  }
}
