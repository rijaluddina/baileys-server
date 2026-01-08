import { BaileysService } from "@core/baileys/baileys.service";
import { db } from "@infrastructure/database";
import { sessions } from "@infrastructure/database/schema";
import { eq } from "drizzle-orm";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

export type SessionStatus = "created" | "connecting" | "connected" | "qr_pending" | "disconnected";

export interface SessionInfo {
    id: string;
    name: string | null;
    status: SessionStatus;
    connected: boolean;
    lastActivity: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface InstanceHealth {
    sessionId: string;
    status: SessionStatus;
    connected: boolean;
    uptime: number | null;
    lastActivity: Date | null;
    memoryUsage?: number;
}

class SessionManager {
    private instances = new Map<string, BaileysService>();
    private instanceMeta = new Map<string, { startedAt: Date; lastActivity: Date }>();
    private log = logger.child({ component: "session-manager" });
    private isShuttingDown = false;

    constructor() {
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Track connection events for status updates
        eventBus.on("connection.open", async (data) => {
            await this.updateSessionStatus(data.sessionId, "connected");
            this.updateActivity(data.sessionId);
        });

        eventBus.on("connection.close", async (data) => {
            await this.updateSessionStatus(data.sessionId, "disconnected");
        });

        eventBus.on("qr.update", async (data) => {
            await this.updateSessionStatus(data.sessionId, "qr_pending");
        });

        eventBus.on("message.received", (data) => {
            this.updateActivity(data.sessionId);
        });

        eventBus.on("message.sent", (data) => {
            this.updateActivity(data.sessionId);
        });
    }

    private updateActivity(sessionId: string): void {
        const meta = this.instanceMeta.get(sessionId);
        if (meta) {
            meta.lastActivity = new Date();
        }
    }

    async createSession(sessionId: string, name?: string): Promise<BaileysService> {
        if (this.instances.has(sessionId)) {
            throw new Error(`Session ${sessionId} already exists`);
        }

        // Create session record in database
        await db
            .insert(sessions)
            .values({
                id: sessionId,
                name: name || sessionId,
                status: "created",
            })
            .onConflictDoNothing();

        const service = new BaileysService({ sessionId });
        this.instances.set(sessionId, service);
        this.instanceMeta.set(sessionId, { startedAt: new Date(), lastActivity: new Date() });

        this.log.info({ sessionId }, "Session created");
        return service;
    }

    async getSession(sessionId: string): Promise<BaileysService | null> {
        return this.instances.get(sessionId) || null;
    }

    async getOrCreateSession(sessionId: string): Promise<BaileysService> {
        let service = this.instances.get(sessionId);
        if (!service) {
            service = await this.createSession(sessionId);
        }
        return service;
    }

    async destroySession(sessionId: string): Promise<void> {
        const service = this.instances.get(sessionId);
        if (service) {
            try {
                await service.disconnect();
            } catch (err) {
                this.log.warn({ sessionId, err }, "Error during disconnect");
            }
            this.instances.delete(sessionId);
            this.instanceMeta.delete(sessionId);
        }

        // Remove from database
        await db.delete(sessions).where(eq(sessions.id, sessionId));

        this.log.info({ sessionId }, "Session destroyed");
    }

    async listSessions(): Promise<SessionInfo[]> {
        const dbSessions = await db.select().from(sessions);
        return dbSessions.map((s) => {
            const instance = this.instances.get(s.id);
            const meta = this.instanceMeta.get(s.id);
            return {
                id: s.id,
                name: s.name,
                status: s.status as SessionStatus,
                connected: instance?.isConnected() ?? false,
                lastActivity: meta?.lastActivity ?? null,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
            };
        });
    }

    async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
        await db
            .update(sessions)
            .set({ status, updatedAt: new Date() })
            .where(eq(sessions.id, sessionId));
    }

    getActiveCount(): number {
        return this.instances.size;
    }

    getConnectedCount(): number {
        let count = 0;
        for (const instance of this.instances.values()) {
            if (instance.isConnected()) count++;
        }
        return count;
    }

    async restoreSession(sessionId: string): Promise<BaileysService | null> {
        const existingSession = await db.query.sessions.findFirst({
            where: eq(sessions.id, sessionId),
        });

        if (!existingSession) {
            return null;
        }

        if (this.instances.has(sessionId)) {
            return this.instances.get(sessionId)!;
        }

        const service = new BaileysService({ sessionId });
        this.instances.set(sessionId, service);
        this.instanceMeta.set(sessionId, { startedAt: new Date(), lastActivity: new Date() });

        this.log.info({ sessionId }, "Session restored");
        return service;
    }

    /**
     * Restore all sessions from database on startup
     */
    async restoreAllSessions(autoConnect = false): Promise<void> {
        const dbSessions = await db.select().from(sessions);

        this.log.info({ count: dbSessions.length }, "Restoring sessions from database");

        for (const session of dbSessions) {
            try {
                const service = await this.restoreSession(session.id);
                if (service && autoConnect) {
                    service.connect().catch((err) => {
                        this.log.error({ sessionId: session.id, err }, "Auto-connect failed");
                    });
                }
            } catch (err) {
                this.log.error({ sessionId: session.id, err }, "Failed to restore session");
            }
        }
    }

    /**
     * Get health status for a specific instance
     */
    getInstanceHealth(sessionId: string): InstanceHealth | null {
        const instance = this.instances.get(sessionId);
        const meta = this.instanceMeta.get(sessionId);

        if (!instance) return null;

        return {
            sessionId,
            status: instance.isConnected() ? "connected" : "disconnected",
            connected: instance.isConnected(),
            uptime: meta ? Date.now() - meta.startedAt.getTime() : null,
            lastActivity: meta?.lastActivity ?? null,
        };
    }

    /**
     * Get health status for all instances
     */
    getAllHealth(): InstanceHealth[] {
        const health: InstanceHealth[] = [];
        for (const sessionId of this.instances.keys()) {
            const h = this.getInstanceHealth(sessionId);
            if (h) health.push(h);
        }
        return health;
    }

    /**
     * Graceful shutdown - disconnect all instances
     */
    async shutdown(): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        this.log.info({ count: this.instances.size }, "Shutting down all sessions");

        const promises = Array.from(this.instances.entries()).map(async ([sessionId, service]) => {
            try {
                await this.updateSessionStatus(sessionId, "disconnected");
                await service.disconnect();
                this.log.info({ sessionId }, "Session shutdown complete");
            } catch (err) {
                this.log.error({ sessionId, err }, "Error during session shutdown");
            }
        });

        await Promise.allSettled(promises);
        this.instances.clear();
        this.instanceMeta.clear();

        this.log.info("All sessions shut down");
    }
}

// Singleton instance
export const sessionManager = new SessionManager();
export type { SessionManager };
