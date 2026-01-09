/**
 * Mock Baileys Socket
 * Scope: Observable behavior only, NOT protocol completeness
 */

import { vi } from "vitest";
import { EventEmitter } from "events";

export interface MockMessage {
    key: {
        remoteJid: string;
        id: string;
        fromMe: boolean;
    };
    message?: {
        conversation?: string;
    };
    messageTimestamp?: number;
}

export interface MockContact {
    id: string;
    name?: string;
    notify?: string;
}

export class MockBaileysSocket extends EventEmitter {
    public user = {
        id: "1234567890@s.whatsapp.net",
        name: "Test User",
    };

    private connected = false;

    // Observable behaviors
    async connect(): Promise<void> {
        this.connected = true;
        this.emit("connection.update", { connection: "open" });
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.emit("connection.update", { connection: "close" });
    }

    isConnected(): boolean {
        return this.connected;
    }

    // Message sending (observable)
    sendMessage = vi.fn(async (jid: string, content: { text: string }) => {
        const messageId = `MSG_${Date.now()}`;
        const message: MockMessage = {
            key: {
                remoteJid: jid,
                id: messageId,
                fromMe: true,
            },
            message: { conversation: content.text },
            messageTimestamp: Math.floor(Date.now() / 1000),
        };

        // Emit sent event
        this.emit("messages.upsert", {
            messages: [message],
            type: "notify",
        });

        return {
            status: 1,
            message,
        };
    });

    // Contact fetching (observable)
    fetchContacts = vi.fn(async () => {
        return [
            { id: "contact1@s.whatsapp.net", name: "Contact 1" },
            { id: "contact2@s.whatsapp.net", name: "Contact 2" },
        ] as MockContact[];
    });

    // Group metadata (observable)
    groupMetadata = vi.fn(async (groupId: string) => {
        return {
            id: groupId,
            subject: "Test Group",
            desc: "Test Description",
            owner: "owner@s.whatsapp.net",
            participants: [
                { id: "participant1@s.whatsapp.net", admin: null },
                { id: "participant2@s.whatsapp.net", admin: "admin" },
            ],
            creation: Math.floor(Date.now() / 1000),
        };
    });

    // Presence (observable)
    presenceSubscribe = vi.fn(async () => { });
    sendPresenceUpdate = vi.fn(async () => { });

    // Simulate incoming message
    simulateIncomingMessage(from: string, text: string): void {
        const message: MockMessage = {
            key: {
                remoteJid: from,
                id: `MSG_${Date.now()}`,
                fromMe: false,
            },
            message: { conversation: text },
            messageTimestamp: Math.floor(Date.now() / 1000),
        };

        this.emit("messages.upsert", {
            messages: [message],
            type: "notify",
        });
    }
}

// Factory function
export function createMockSocket(): MockBaileysSocket {
    return new MockBaileysSocket();
}
