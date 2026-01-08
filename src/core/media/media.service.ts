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

export interface DownloadedMedia {
    buffer: Buffer;
    mimetype: string;
    filename?: string;
    stored?: StoredMedia;
}

export class MediaService {
    private readonly log = logger.child({ component: "media-service" });

    constructor(private readonly getSocket: () => WASocket | null, private readonly sessionId: string) { }

    /**
     * Download media from a received message
     */
    async downloadMedia(message: WAMessage, saveToStorage = true): Promise<DownloadedMedia | null> {
        const socket = this.getSocket();
        if (!socket) {
            this.log.warn("Cannot download media: socket not connected");
            return null;
        }

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
                this.log.info({ messageId: message.key.id, path: result.stored.path }, "Media downloaded and saved");
            }

            return result;
        } catch (error) {
            this.log.error({ error, messageId: message.key.id }, "Failed to download media");
            return null;
        }
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
            ptt?: boolean; // Push to talk for audio
        } = {}
    ): Promise<AnyMessageContent> {
        let buffer: Buffer;

        if (typeof source === "string") {
            // It's a file path from storage
            buffer = await mediaStorage.get(source);
        } else {
            buffer = source;
        }

        const baseContent = {
            caption: options.caption,
        };

        switch (type) {
            case "image":
                return {
                    image: buffer,
                    mimetype: options.mimetype || "image/jpeg",
                    ...baseContent,
                };
            case "video":
                return {
                    video: buffer,
                    mimetype: options.mimetype || "video/mp4",
                    ...baseContent,
                };
            case "audio":
                return {
                    audio: buffer,
                    mimetype: options.mimetype || "audio/ogg; codecs=opus",
                    ptt: options.ptt ?? true,
                };
            case "document":
                return {
                    document: buffer,
                    mimetype: options.mimetype || "application/octet-stream",
                    fileName: options.filename || "document",
                    ...baseContent,
                };
            case "sticker":
                return {
                    sticker: buffer,
                    mimetype: options.mimetype || "image/webp",
                };
            default:
                throw new Error(`Unsupported media type: ${type}`);
        }
    }

    /**
     * Get stored media by path
     */
    async getStoredMedia(path: string): Promise<Buffer> {
        return mediaStorage.get(path);
    }

    /**
     * Delete stored media
     */
    async deleteStoredMedia(path: string): Promise<void> {
        await mediaStorage.delete(path);
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

        if (messageContent.documentMessage) {
            return messageContent.documentMessage.fileName || undefined;
        }

        return undefined;
    }
}
