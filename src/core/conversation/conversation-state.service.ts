import { eq, and, lt } from "drizzle-orm";
import { db } from "@infrastructure/database";
import { conversationStates, type ConversationState } from "@infrastructure/database/schema";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "conversation-state" });

export interface StateUpdate {
    context?: Record<string, unknown>;
    history?: Array<{ role: string; content: string; timestamp: string }>;
    metadata?: Record<string, unknown>;
    agentId?: string;
    ttlMinutes?: number;
}

class ConversationStateService {
    /**
     * Generate state ID from session and JID
     */
    private makeId(sessionId: string, jid: string): string {
        return `${sessionId}:${jid}`;
    }

    /**
     * Get conversation state
     */
    async get(sessionId: string, jid: string): Promise<ConversationState | null> {
        const id = this.makeId(sessionId, jid);

        const [state] = await db
            .select()
            .from(conversationStates)
            .where(eq(conversationStates.id, id))
            .limit(1);

        if (!state) return null;

        // Check expiration
        if (state.expiresAt && new Date(state.expiresAt) < new Date()) {
            await this.clear(sessionId, jid);
            return null;
        }

        return state;
    }

    /**
     * Update or create conversation state
     */
    async update(sessionId: string, jid: string, update: StateUpdate): Promise<ConversationState> {
        const id = this.makeId(sessionId, jid);
        const existing = await this.get(sessionId, jid);

        const expiresAt = update.ttlMinutes
            ? new Date(Date.now() + update.ttlMinutes * 60 * 1000)
            : undefined;

        if (existing) {
            // Merge context and metadata
            const newContext = update.context
                ? { ...(existing.context as Record<string, unknown>), ...update.context }
                : existing.context;

            const newMetadata = update.metadata
                ? { ...(existing.metadata as Record<string, unknown>), ...update.metadata }
                : existing.metadata;

            // Append or replace history
            const newHistory = update.history
                ? [...(existing.history as Array<any>), ...update.history].slice(-100) // Keep last 100
                : existing.history;

            await db
                .update(conversationStates)
                .set({
                    context: newContext,
                    history: newHistory,
                    metadata: newMetadata,
                    agentId: update.agentId ?? existing.agentId,
                    version: (existing.version ?? 1) + 1,
                    expiresAt: expiresAt ?? existing.expiresAt,
                    updatedAt: new Date(),
                })
                .where(eq(conversationStates.id, id));

            log.debug({ sessionId, jid }, "Conversation state updated");
        } else {
            // Create new state
            await db.insert(conversationStates).values({
                id,
                sessionId,
                jid,
                agentId: update.agentId,
                context: update.context ?? {},
                history: update.history ?? [],
                metadata: update.metadata ?? {},
                expiresAt,
            });

            log.debug({ sessionId, jid }, "Conversation state created");
        }

        return (await this.get(sessionId, jid))!;
    }

    /**
     * Clear conversation state
     */
    async clear(sessionId: string, jid: string): Promise<void> {
        const id = this.makeId(sessionId, jid);
        await db.delete(conversationStates).where(eq(conversationStates.id, id));
        log.debug({ sessionId, jid }, "Conversation state cleared");
    }

    /**
     * List states for a session
     */
    async listBySession(sessionId: string): Promise<ConversationState[]> {
        return db
            .select()
            .from(conversationStates)
            .where(eq(conversationStates.sessionId, sessionId));
    }

    /**
     * Add message to history
     */
    async addToHistory(
        sessionId: string,
        jid: string,
        role: "user" | "assistant" | "system",
        content: string
    ): Promise<void> {
        await this.update(sessionId, jid, {
            history: [{ role, content, timestamp: new Date().toISOString() }],
        });
    }

    /**
     * Set context value
     */
    async setContext(sessionId: string, jid: string, key: string, value: unknown): Promise<void> {
        await this.update(sessionId, jid, {
            context: { [key]: value },
        });
    }

    /**
     * Cleanup expired states
     */
    async cleanupExpired(): Promise<number> {
        const result = await db
            .delete(conversationStates)
            .where(lt(conversationStates.expiresAt, new Date()));

        log.info("Cleaned up expired conversation states");
        return 0; // Drizzle doesn't return count easily
    }
}

export const conversationStateService = new ConversationStateService();
