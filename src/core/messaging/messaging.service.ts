import {
    type WASocket,
    type WAMessage,
    type AnyMessageContent,
    type proto,
    generateWAMessageFromContent,
    getContentType,
} from "@whiskeysockets/baileys";
import { MediaService, type MediaType } from "@core/media";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

export interface SendTextOptions {
    quoted?: WAMessage;
}

export interface SendMediaOptions {
    caption?: string;
    quoted?: WAMessage;
    filename?: string;
    mimetype?: string;
    ptt?: boolean;
}

export interface ForwardOptions {
    forceForward?: boolean;
}

export interface MessageResult {
    messageId: string;
    timestamp: number;
}

export class MessagingService {
    private readonly log = logger.child({ component: "messaging-service" });
    private readonly mediaService: MediaService;

    constructor(
        private readonly getSocket: () => WASocket | null,
        private readonly sessionId: string
    ) {
        this.mediaService = new MediaService(getSocket, sessionId);
    }

    /**
     * Send a text message
     */
    async sendText(jid: string, text: string, options: SendTextOptions = {}): Promise<MessageResult> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const content: AnyMessageContent = { text };

        const result = await socket.sendMessage(jid, content, {
            quoted: options.quoted,
        });

        const messageId = result?.key.id || `msg_${Date.now()}`;
        const timestamp = Date.now();

        eventBus.emit("message.sent", {
            sessionId: this.sessionId,
            messageId,
            to: jid,
            type: "text",
            timestamp,
        });

        this.log.info({ to: jid, messageId }, "Text message sent");

        return { messageId, timestamp };
    }

    /**
     * Send a media message
     */
    async sendMedia(
        jid: string,
        type: MediaType,
        source: Buffer | string,
        options: SendMediaOptions = {}
    ): Promise<MessageResult> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const content = await this.mediaService.prepareMedia(type, source, {
            caption: options.caption,
            filename: options.filename,
            mimetype: options.mimetype,
            ptt: options.ptt,
        });

        const result = await socket.sendMessage(jid, content, {
            quoted: options.quoted,
        });

        const messageId = result?.key.id || `msg_${Date.now()}`;
        const timestamp = Date.now();

        const eventType = type === "sticker" ? "image" : type;
        eventBus.emit("message.sent", {
            sessionId: this.sessionId,
            messageId,
            to: jid,
            type: eventType as "text" | "image" | "video" | "audio" | "document",
            timestamp,
        });

        this.log.info({ to: jid, messageId, type }, "Media message sent");

        return { messageId, timestamp };
    }

    /**
     * Reply to a message
     */
    async reply(
        jid: string,
        text: string,
        quotedMessage: WAMessage
    ): Promise<MessageResult> {
        return this.sendText(jid, text, { quoted: quotedMessage });
    }

    /**
     * Forward a message to another chat
     */
    async forward(
        jid: string,
        message: WAMessage,
        options: ForwardOptions = {}
    ): Promise<MessageResult> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const result = await socket.sendMessage(jid, {
            forward: message,
            force: options.forceForward,
        });

        const messageId = result?.key.id || `msg_${Date.now()}`;
        const timestamp = Date.now();

        this.log.info({ to: jid, messageId, originalId: message.key.id }, "Message forwarded");

        return { messageId, timestamp };
    }

    /**
     * Delete a message for everyone
     */
    async delete(
        jid: string,
        messageKey: proto.IMessageKey
    ): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.sendMessage(jid, { delete: messageKey });
        this.log.info({ jid, messageId: messageKey.id }, "Message deleted for everyone");
    }

    /**
     * Mark messages as read
     */
    async markAsRead(jid: string, messageKeys: proto.IMessageKey[]): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.readMessages(messageKeys);
        this.log.debug({ jid, count: messageKeys.length }, "Messages marked as read");
    }

    /**
     * Send typing indicator
     */
    async sendTyping(jid: string, duration = 3000): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.sendPresenceUpdate("composing", jid);

        setTimeout(async () => {
            try {
                await socket.sendPresenceUpdate("paused", jid);
            } catch {
                // Ignore errors on pause
            }
        }, duration);
    }

    /**
     * Get the media service for advanced media operations
     */
    getMediaService(): MediaService {
        return this.mediaService;
    }

    /**
     * Determine message type from WAMessage
     */
    static getMessageType(message: WAMessage): "text" | "image" | "video" | "audio" | "document" | "sticker" | "other" {
        const content = message.message;
        if (!content) return "other";

        const contentType = getContentType(content);

        switch (contentType) {
            case "conversation":
            case "extendedTextMessage":
                return "text";
            case "imageMessage":
                return "image";
            case "videoMessage":
                return "video";
            case "audioMessage":
                return "audio";
            case "documentMessage":
                return "document";
            case "stickerMessage":
                return "sticker";
            default:
                return "other";
        }
    }

    /**
     * Extract text content from a message
     */
    static extractText(message: WAMessage): string | null {
        const content = message.message;
        if (!content) return null;

        if (content.conversation) return content.conversation;
        if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
        if (content.imageMessage?.caption) return content.imageMessage.caption;
        if (content.videoMessage?.caption) return content.videoMessage.caption;
        if (content.documentMessage?.caption) return content.documentMessage.caption;

        return null;
    }
}
