import type { WASocket } from "@whiskeysockets/baileys";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

export type PresenceType = "available" | "unavailable" | "composing" | "recording" | "paused";

export interface PresenceInfo {
    jid: string;
    presence: PresenceType;
    lastSeen?: number;
}

export class PresenceService {
    private readonly log = logger.child({ component: "presence-service" });
    private subscriptions = new Set<string>();

    constructor(
        private readonly getSocket: () => WASocket | null,
        private readonly sessionId: string
    ) { }

    /**
     * Set own presence status
     */
    async setPresence(presence: "available" | "unavailable"): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.sendPresenceUpdate(presence);
        this.log.debug({ presence }, "Presence updated");
    }

    /**
     * Send typing indicator to a chat
     */
    async setTyping(jid: string): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.sendPresenceUpdate("composing", jid);
    }

    /**
     * Send recording indicator to a chat
     */
    async setRecording(jid: string): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.sendPresenceUpdate("recording", jid);
    }

    /**
     * Clear typing/recording indicator
     */
    async clearPresence(jid: string): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.sendPresenceUpdate("paused", jid);
    }

    /**
     * Subscribe to presence updates for a contact
     */
    async subscribe(jid: string): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.presenceSubscribe(jid);
        this.subscriptions.add(jid);
        this.log.debug({ jid }, "Subscribed to presence");
    }

    /**
     * Check if subscribed to a contact's presence
     */
    isSubscribed(jid: string): boolean {
        return this.subscriptions.has(jid);
    }

    /**
     * Get list of presence subscriptions
     */
    getSubscriptions(): string[] {
        return Array.from(this.subscriptions);
    }

    /**
     * Helper: Set typing indicator with auto-clear
     */
    async showTyping(jid: string, durationMs = 3000): Promise<void> {
        await this.setTyping(jid);

        setTimeout(async () => {
            try {
                await this.clearPresence(jid);
            } catch {
                // Ignore errors on clear
            }
        }, durationMs);
    }

    /**
     * Helper: Set recording indicator with auto-clear
     */
    async showRecording(jid: string, durationMs = 3000): Promise<void> {
        await this.setRecording(jid);

        setTimeout(async () => {
            try {
                await this.clearPresence(jid);
            } catch {
                // Ignore errors on clear
            }
        }, durationMs);
    }
}
