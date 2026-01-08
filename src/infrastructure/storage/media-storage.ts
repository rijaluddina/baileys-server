import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { logger } from "@infrastructure/logger";

export interface MediaStorageConfig {
    basePath: string;
}

export interface StoredMedia {
    path: string;
    mimetype: string;
    size: number;
    filename: string;
}

export interface MediaStorage {
    save(sessionId: string, messageId: string, data: Buffer, mimetype: string, filename?: string): Promise<StoredMedia>;
    get(path: string): Promise<Buffer>;
    delete(path: string): Promise<void>;
    exists(path: string): Promise<boolean>;
}

export class LocalMediaStorage implements MediaStorage {
    private readonly basePath: string;
    private readonly log = logger.child({ component: "media-storage" });

    constructor(config: MediaStorageConfig) {
        this.basePath = config.basePath;
    }

    async save(
        sessionId: string,
        messageId: string,
        data: Buffer,
        mimetype: string,
        filename?: string
    ): Promise<StoredMedia> {
        const ext = this.getExtension(mimetype);
        const safeFilename = filename?.replace(/[^a-zA-Z0-9.-]/g, "_") || `media_${Date.now()}`;
        const relativePath = join(sessionId, `${messageId}_${safeFilename}${ext ? `.${ext}` : ""}`);
        const fullPath = join(this.basePath, relativePath);

        // Ensure directory exists
        await mkdir(dirname(fullPath), { recursive: true });

        // Write file
        await writeFile(fullPath, data);

        this.log.debug({ path: relativePath, size: data.length }, "Media saved");

        return {
            path: relativePath,
            mimetype,
            size: data.length,
            filename: safeFilename,
        };
    }

    async get(path: string): Promise<Buffer> {
        // Prevent path traversal
        const safePath = this.sanitizePath(path);
        const fullPath = join(this.basePath, safePath);
        return readFile(fullPath);
    }

    async delete(path: string): Promise<void> {
        const safePath = this.sanitizePath(path);
        const fullPath = join(this.basePath, safePath);
        await unlink(fullPath);
        this.log.debug({ path: safePath }, "Media deleted");
    }

    async exists(path: string): Promise<boolean> {
        try {
            const safePath = this.sanitizePath(path);
            const fullPath = join(this.basePath, safePath);
            await stat(fullPath);
            return true;
        } catch {
            return false;
        }
    }

    private sanitizePath(path: string): string {
        // Remove any path traversal attempts
        return path.replace(/\.\./g, "").replace(/^\/+/, "");
    }

    private getExtension(mimetype: string): string {
        const map: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/gif": "gif",
            "image/webp": "webp",
            "video/mp4": "mp4",
            "video/webm": "webm",
            "audio/ogg": "ogg",
            "audio/mpeg": "mp3",
            "audio/mp4": "m4a",
            "application/pdf": "pdf",
            "application/msword": "doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        };
        return map[mimetype] || "";
    }
}

// Default instance
const mediaBasePath = process.env.MEDIA_STORAGE_PATH || "./media";
export const mediaStorage = new LocalMediaStorage({ basePath: mediaBasePath });
