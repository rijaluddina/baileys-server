import { EventEmitter } from "events";
import type { ConnectionState, WAMessage, Contact, GroupMetadata } from "@whiskeysockets/baileys";

// Message event payloads
export interface MessageReceivedPayload {
    sessionId: string;
    message: WAMessage;
    type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "other";
}

export interface MessageSentPayload {
    sessionId: string;
    messageId: string;
    to: string;
    type: "text" | "image" | "video" | "audio" | "document";
    timestamp: number;
}

export interface MessageStatusPayload {
    sessionId: string;
    messageId: string;
    status: "sent" | "delivered" | "read" | "played";
    participant?: string;
    timestamp: number;
}

// Contact event payloads
export interface ContactUpdatedPayload {
    sessionId: string;
    contacts: Partial<Contact>[];
}

// Group event payloads
export interface GroupUpdatedPayload {
    sessionId: string;
    groupId: string;
    metadata?: GroupMetadata;
    action?: "create" | "update" | "participant_add" | "participant_remove" | "promote" | "demote";
    participants?: string[];
}

// Presence event payloads
export interface PresenceUpdatedPayload {
    sessionId: string;
    jid: string;
    presence: "available" | "unavailable" | "composing" | "recording" | "paused";
    lastSeen?: number;
}

// Event payload types
export interface EventPayloads {
    // Connection events
    "connection.open": { sessionId: string };
    "connection.close": { sessionId: string; reason?: string };
    "connection.update": { sessionId: string; state: Partial<ConnectionState> };
    "qr.update": { sessionId: string; qr: string };

    // Message events
    "message.received": MessageReceivedPayload;
    "message.sent": MessageSentPayload;
    "message.status": MessageStatusPayload;

    // Contact events
    "contact.updated": ContactUpdatedPayload;

    // Group events
    "group.updated": GroupUpdatedPayload;

    // Presence events
    "presence.updated": PresenceUpdatedPayload;
}

export type EventName = keyof EventPayloads;

class TypedEventBus {
    private emitter = new EventEmitter();

    on<K extends EventName>(event: K, listener: (data: EventPayloads[K]) => void): this {
        this.emitter.on(event, listener);
        return this;
    }

    off<K extends EventName>(event: K, listener: (data: EventPayloads[K]) => void): this {
        this.emitter.off(event, listener);
        return this;
    }

    once<K extends EventName>(event: K, listener: (data: EventPayloads[K]) => void): this {
        this.emitter.once(event, listener);
        return this;
    }

    emit<K extends EventName>(event: K, data: EventPayloads[K]): boolean {
        return this.emitter.emit(event, data);
    }

    removeAllListeners(event?: EventName): this {
        this.emitter.removeAllListeners(event);
        return this;
    }
}

export const eventBus = new TypedEventBus();
export type { TypedEventBus };
