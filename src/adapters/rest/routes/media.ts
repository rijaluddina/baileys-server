/**
 * Media REST routes
 * - Upload with multipart/form-data
 * - Send media messages
 */

import { Hono } from "hono";
import { z } from "zod";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { sessionManager } from "@core/session/session.manager";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "media-routes" });

const mediaRoutes = new Hono();

// Size limits
const SIZE_LIMITS = {
    image: 5 * 1024 * 1024,
    video: 16 * 1024 * 1024,
    audio: 16 * 1024 * 1024,
    document: 100 * 1024 * 1024,
} as const;

// Send media schema
const sendMediaSchema = z.object({
    to: z.string().min(1),
    type: z.enum(["image", "video", "audio", "document"]),
    caption: z.string().optional(),
    filename: z.string().optional(),
    mediaUrl: z.string().url().optional(),
    mediaBase64: z.string().optional(),
});

/**
 * POST /sessions/:sessionId/media/send
 * Send media message
 */
mediaRoutes.post("/:sessionId/media/send", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
        return c.json(errorResponse(ErrorCodes.SESSION_NOT_FOUND, "Session not found"), 404);
    }

    const socket = session.getSocket();
    if (!socket) {
        return c.json(errorResponse(ErrorCodes.SESSION_NOT_CONNECTED, "Session not connected"), 400);
    }

    try {
        const body = await c.req.json();
        const data = sendMediaSchema.parse(body);

        let buffer: Buffer;

        if (data.mediaUrl) {
            const response = await fetch(data.mediaUrl);
            if (!response.ok) {
                return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Failed to fetch media from URL"), 400);
            }
            buffer = Buffer.from(await response.arrayBuffer());
        } else if (data.mediaBase64) {
            buffer = Buffer.from(data.mediaBase64, "base64");
        } else {
            return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Either mediaUrl or mediaBase64 required"), 400);
        }

        // Validate size
        const limit = SIZE_LIMITS[data.type];
        if (buffer.length > limit) {
            return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, `File exceeds ${limit / 1024 / 1024}MB limit`), 400);
        }

        // Build message content
        const content: Record<string, any> = {};
        if (data.type === "image") {
            content.image = buffer;
            content.mimetype = "image/jpeg";
        } else if (data.type === "video") {
            content.video = buffer;
            content.mimetype = "video/mp4";
        } else if (data.type === "audio") {
            content.audio = buffer;
            content.mimetype = "audio/ogg";
        } else if (data.type === "document") {
            content.document = buffer;
            content.mimetype = "application/octet-stream";
            content.fileName = data.filename || "document";
        }

        if (data.caption) {
            content.caption = data.caption;
        }

        const result = await socket.sendMessage(data.to, content as any);

        log.info(
            { sessionId, to: data.to, type: data.type, messageId: result?.key?.id },
            "Media message sent"
        );

        return c.json(successResponse({
            messageId: result?.key?.id,
            to: data.to,
            type: data.type,
            timestamp: new Date().toISOString(),
        }));
    } catch (error: any) {
        log.error({ error, sessionId }, "Send media failed");
        if (error.name === "ZodError") {
            return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Invalid input"), 400);
        }
        return c.json(errorResponse(ErrorCodes.INTERNAL_ERROR, error.message), 500);
    }
});

export { mediaRoutes };
