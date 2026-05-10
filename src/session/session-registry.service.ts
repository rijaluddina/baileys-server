import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service.js';
import { RedisLockService } from '../redis/redis-lock.service.js';
import type { Lock } from '../redis/redis-lock.service.js';

export interface SessionRegistryEntry {
  sessionId: string;
  workerId: string;
  status: string;
  lastHeartbeat: number;
  host: string;
}

export interface WorkerInfo {
  workerId: string;
  host: string;
  pid: number;
  startedAt: Date;
  sessionsOwned: number;
}

@Injectable()
export class SessionRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionRegistryService.name);
  private readonly keyPrefix: string;
  private readonly workerId: string;
  private readonly heartbeatInterval: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly locks = new Map<string, Lock>();

  constructor(
    private readonly redisService: RedisService,
    private readonly lockService: RedisLockService,
    private readonly configService: ConfigService,
  ) {
    this.keyPrefix =
      this.configService.get<string>('redis.keyPrefix') ?? 'baileys:';
    this.workerId = this.generateWorkerId();
    this.heartbeatInterval =
      this.configService.get<number>('app.session.heartbeatInterval') ?? 10000;
    this.startHeartbeat();
  }

  async onModuleDestroy() {
    this.stopHeartbeat();
    await this.releaseAllLocks();
  }

  async registerSession(
    sessionId: string,
    status: string,
    options: { lockTtlMs?: number } = {},
  ): Promise<boolean> {
    const lockTtlMs =
      options.lockTtlMs ??
      this.configService.get<number>('app.session.lockTtl') ??
      30000;

    const lock = await this.lockService.acquireLock(`session:${sessionId}`, {
      ttlMs: lockTtlMs,
      retryCount: 3,
      retryDelayMs: 500,
    });

    if (!lock) {
      this.logger.warn(`Failed to acquire lock for session: ${sessionId}`);
      return false;
    }

    this.locks.set(sessionId, lock);

    const sessionKey = `${this.keyPrefix}session:${sessionId}`;
    const ownerKey = `${this.keyPrefix}session:${sessionId}:owner`;

    await Promise.all([
      this.redisService.set(
        sessionKey,
        JSON.stringify({
          sessionId,
          workerId: this.workerId,
          status,
          lastHeartbeat: Date.now(),
          host: this.getHostName(),
        }),
        Math.ceil(lockTtlMs / 1000),
      ),
      this.redisService.set(ownerKey, this.workerId),
    ]);

    this.logger.log(
      `Registered session "${sessionId}" to worker "${this.workerId}"`,
    );
    return true;
  }

  async unregisterSession(sessionId: string): Promise<void> {
    const lock = this.locks.get(sessionId);
    if (lock) {
      await lock.release();
      this.locks.delete(sessionId);
    }

    const sessionKey = `${this.keyPrefix}session:${sessionId}`;
    const ownerKey = `${this.keyPrefix}session:${sessionId}:owner`;

    await Promise.all([
      this.redisService.del(sessionKey),
      this.redisService.del(ownerKey),
    ]);

    this.logger.log(
      `Unregistered session "${sessionId}" from worker "${this.workerId}"`,
    );
  }

  async updateSessionStatus(sessionId: string, status: string): Promise<void> {
    const sessionKey = `${this.keyPrefix}session:${sessionId}`;
    const data = await this.redisService.get(sessionKey);

    if (data) {
      const parsed = JSON.parse(data) as SessionRegistryEntry;
      parsed.status = status;
      parsed.lastHeartbeat = Date.now();
      await this.redisService.set(sessionKey, JSON.stringify(parsed));
    }
  }

  async getSessionOwner(sessionId: string): Promise<string | null> {
    const ownerKey = `${this.keyPrefix}session:${sessionId}:owner`;
    return this.redisService.get(ownerKey);
  }

  async getSessionEntry(
    sessionId: string,
  ): Promise<SessionRegistryEntry | null> {
    const sessionKey = `${this.keyPrefix}session:${sessionId}`;
    const data = await this.redisService.get(sessionKey);

    if (!data) return null;
    return JSON.parse(data) as SessionRegistryEntry;
  }

  async getSessionsByWorker(workerId: string): Promise<string[]> {
    const pattern = `${this.keyPrefix}session:*`;
    const keys = await this.redisService.keys(pattern);
    const sessions: string[] = [];

    for (const key of keys) {
      if (key.endsWith(':owner')) continue;
      const ownerKey = `${key.slice(0, -7)}:owner`;
      const owner = await this.redisService.get(ownerKey);
      if (owner === workerId) {
        const sessionId = key.replace(`${this.keyPrefix}session:`, '');
        sessions.push(sessionId);
      }
    }

    return sessions;
  }

  async getActiveSessions(): Promise<SessionRegistryEntry[]> {
    const pattern = `${this.keyPrefix}session:*`;
    const keys = await this.redisService.keys(pattern);
    const sessions: SessionRegistryEntry[] = [];

    for (const key of keys) {
      if (key.endsWith(':owner')) continue;
      const data = await this.redisService.get(key);
      if (data) {
        const entry = JSON.parse(data) as SessionRegistryEntry;
        const age = Date.now() - entry.lastHeartbeat;
        if (age < 60000) {
          sessions.push(entry);
        }
      }
    }

    return sessions;
  }

  async isSessionLocked(sessionId: string): Promise<boolean> {
    return this.lockService.isLocked(`session:${sessionId}`);
  }

  async refreshLock(sessionId: string, ttlMs?: number): Promise<boolean> {
    const lock = this.locks.get(sessionId);
    if (!lock) return false;

    const key = `${this.keyPrefix}lock:session:${sessionId}`;
    const ttl =
      ttlMs ?? this.configService.get<number>('app.session.lockTtl') ?? 30000;
    return this.lockService.extendLock(key, lock.token, ttl);
  }

  async publishSessionEvent(
    sessionId: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    const channel = `${this.keyPrefix}session:${sessionId}:events`;
    await this.redisService.publish(
      channel,
      JSON.stringify({ event, data, timestamp: Date.now() }),
    );
  }

  subscribeToSessionEvents(
    sessionId: string,
    callback: (event: string, data: unknown) => void,
  ): void {
    const channel = `${this.keyPrefix}session:${sessionId}:events`;
    void this.redisService.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message) as { event: string; data: unknown };
        callback(parsed.event, parsed.data);
      } catch {
        // Ignore parse errors
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    const activeSessions = await this.getActiveSessions();
    const mySessions = activeSessions.filter(
      (s) => s.workerId === this.workerId,
    );

    for (const session of mySessions) {
      const lockTtl =
        this.configService.get<number>('app.session.lockTtl') ?? 30000;
      await this.refreshLock(session.sessionId, lockTtl);
      await this.updateSessionStatus(session.sessionId, session.status);
    }
  }

  private async releaseAllLocks(): Promise<void> {
    for (const [sessionId, lock] of this.locks) {
      await lock.release();
      this.logger.log(`Released lock for session: ${sessionId}`);
    }
    this.locks.clear();
  }

  private generateWorkerId(): string {
    const hostname = this.getHostName();
    const pid = process.pid;
    const timestamp = Date.now().toString(36);
    return `${hostname}-${pid}-${timestamp}`;
  }

  private getHostName(): string {
    return process.env.HOSTNAME ?? process.env.HOST ?? 'unknown';
  }
}
