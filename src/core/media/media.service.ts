import {
    downloadMediaMessage,
    type WASocket,
    type WAMessage,
    type AnyMessageContent,
} from "@whiskeysockets/baileys";
import { mediaStorage, type StoredMedia } from "@infrastructure/storage";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

export type MediaType = "image" | "video" | "audio" | "document" | "sticker";

// Magic bytes for file type validation (security)
const MAGIC_BYTES: Record<string, number[]> = {
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47],
    "image/gif": [0x47, 0x49, 0x46],
    "image/webp": [0x52, 0x49, 0x46, 0x46],
    "application/pdf": [0x25, 0x50, 0x44, 0x46],
    "application/zip": [0x50, 0x4b, 0x03, 0x04],
};

// Size limits
const SIZE_LIMITS: Record<MediaType, number> = {
    image: 5 * 1024 * 1024,      // 5MB
    video: 16 * 1024 * 1024,     // 16MB
    audio: 16 * 1024 * 1024,     // 16MB
    document: 100 * 1024 * 1024, // 100MB
    sticker: 500 * 1024,         // 500KB
};

// Agent-safe mimetypes
const AGENT_ALLOWED_MIMETYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
];

export interface DownloadedMedia {
    buffer: Buffer;
    mimetype: string;
    filename?: string;
    stored?: StoredMedia;
}

/**
 * Validate magic bytes for security
 */
function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
    const expected = MAGIC_BYTES[mimetype];
    if (!expected) return true; // Unknown type, allow

    for (let i = 0; i < expected.length; i++) {
        if (buffer[i] !== expected[i]) return false;
    }
    return true;
}

/**
 * Detect mimetype from buffer
 */
function detectMimetype(buffer: Buffer): string | null {
    for (const [mimetype, bytes] of Object.entries(MAGIC_BYTES)) {
        let match = true;
        for (let i = 0; i < bytes.length; i++) {
            if (buffer[i] !== bytes[i]) {
                match = false;
                break;
            }
        }
        if (match) return mimetype;
    }
    return null;
}

export class MediaService {
    private readonly log = logger.child({ component: "media-service" });

    constructor(
        private readonly getSocket: () => WASocket | null,
        private readonly sessionId: string
    ) { }

    /**
     * Check if mimetype is allowed for MCP agents
     */
    isAgentAllowed(mimetype: string): boolean {
        return AGENT_ALLOWED_MIMETYPES.includes(mimetype);
    }

    /**
     * Validate media before sending
     */
    validateMedia(buffer: Buffer, type: MediaType, mimetype: string): { valid: boolean; error?: string } {
        // Size check
        const limit = SIZE_LIMITS[type];
        if (buffer.length > limit) {
            return { valid: false, error: `File exceeds ${limit / 1024 / 1024}MB limit` };
        }

        // Magic byte check for images
        if (type === "image" && !validateMagicBytes(buffer, mimetype)) {
            return { valid: false, error: "Invalid image format (magic bytes mismatch)" };
        }

        return { valid: true };
    }

    /**
     * Download media with retry logic
     */
    async downloadMedia(message: WAMessage, saveToStorage = true, maxRetries = 3): Promise<DownloadedMedia | null> {
        const socket = this.getSocket();
        if (!socket) {
            this.log.warn("Cannot download media: socket not connected");
            return null;
        }

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const buffer = await downloadMediaMessage(
                    message,
                    "buffer",
                    {},
                    {
                        logger: this.log,
                        reuploadRequest: socket.updateMediaMessage,
                    }
                );

                const messageContent = message.message;
                const mimetype = this.extractMimetype(messageContent);
                const filename = this.extractFilename(messageContent);

                const result: DownloadedMedia = {
                    buffer: buffer as Buffer,
                    mimetype,
                    filename,
                };

                if (saveToStorage && message.key.id) {
                    result.stored = await mediaStorage.save(
                        this.sessionId,
                        message.key.id,
                        buffer as Buffer,
                        mimetype,
                        filename
                    );
                    this.log.info({ messageId: message.key.id, path: result.stored.path }, "Media downloaded");
                }

                return result;
            } catch (error: any) {
                lastError = error;
                this.log.warn(
                    { messageId: message.key.id, attempt, error: error.message },
                    "Media download failed, retrying..."
                );

                if (attempt < maxRetries) {
                    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
                }
            }
        }

        this.log.error({ error: lastError, messageId: message.key.id }, "Media download failed after retries");
        return null;
    }

    /**
     * Prepare media for sending
     */
    async prepareMedia(
        type: MediaType,
        source: Buffer | string,
        options: {
            mimetype?: string;
            filename?: string;
            caption?: string;
            ptt?: boolean;
        } = {}
    ): Promise<AnyMessageContent> {
        let buffer: Buffer;

        if (typeof source === "string") {
            buffer = await mediaStorage.get(source);
        } else {
            buffer = source;
        }

        // Auto-detect mimetype if not provided
        const detectedMimetype = detectMimetype(buffer);
        const mimetype = options.mimetype || detectedMimetype || this.getDefaultMimetype(type);

        // Validate
        const validation = this.validateMedia(buffer, type, mimetype);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const baseContent = { caption: options.caption };

        switch (type) {
            case "image":
                return { image: buffer, mimetype, ...baseContent };
            case "video":
                return { video: buffer, mimetype, ...baseContent };
            case "audio":
                return { audio: buffer, mimetype, ptt: options.ptt ?? true };
            case "document":
                return { document: buffer, mimetype, fileName: options.filename || "document", ...baseContent };
            case "sticker":
                return { sticker: buffer, mimetype };
            default:
                throw new Error(`Unsupported media type: ${type}`);
        }
    }

    async getStoredMedia(path: string): Promise<Buffer> {
        return mediaStorage.get(path);
    }

    async deleteStoredMedia(path: string): Promise<void> {
        await mediaStorage.delete(path);
    }

    private getDefaultMimetype(type: MediaType): string {
        const defaults: Record<MediaType, string> = {
            image: "image/jpeg",
            video: "video/mp4",
            audio: "audio/ogg; codecs=opus",
            document: "application/octet-stream",
            sticker: "image/webp",
        };
        return defaults[type];
    }

    private extractMimetype(messageContent: WAMessage["message"]): string {
        if (!messageContent) return "application/octet-stream";
        if (messageContent.imageMessage) return messageContent.imageMessage.mimetype || "image/jpeg";
        if (messageContent.videoMessage) return messageContent.videoMessage.mimetype || "video/mp4";
        if (messageContent.audioMessage) return messageContent.audioMessage.mimetype || "audio/ogg";
        if (messageContent.documentMessage) return messageContent.documentMessage.mimetype || "application/octet-stream";
        if (messageContent.stickerMessage) return messageContent.stickerMessage.mimetype || "image/webp";
        return "application/octet-stream";
    }

    private extractFilename(messageContent: WAMessage["message"]): string | undefined {
        if (!messageContent) return undefined;
        if (messageContent.documentMessage) return messageContent.documentMessage.fileName || undefined;
        return undefined;
    }
}

