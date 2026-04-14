import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sessionManager } from "@core/session/session.manager";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { sendTextMessageSchema, sendMediaMessageSchema, deleteMessageSchema } from "../schemas";
import { breakers } from "@infrastructure/resilience";
import { AppError, ErrorCode } from "@infrastructure/errors";
import { requirePermission } from "../auth.middleware";

export const messageRoutes = new Hono();

/**
 * Handle circuit breaker errors and return appropriate 503 response
 */
function isCircuitBreakerError(err: unknown): boolean {
    return err instanceof AppError && err.code === ErrorCode.CIRCUIT_BREAKER_OPEN;
}

// Send text message
messageRoutes.post(
    "/send",
    requirePermission("messages:send"),
    zValidator("json", sendTextMessageSchema),
    async (c) => {
        const { sessionId, to, text, quotedMessageId } = c.req.valid("json");

        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return c.json(
                errorResponse(ErrorCodes.SESSION_NOT_FOUND, "Session not found"),
                404
            );
        }

        if (!session.isConnected()) {
            return c.json(
                errorResponse(ErrorCodes.SESSION_NOT_CONNECTED, "Session not connected"),
                400
            );
        }

        try {
            // Wrap with circuit breaker (Architecture: Skenario 2 — fast-fail on WA disconnect)
            const result = await breakers.whatsapp.execute(() =>
                session.messaging.sendText(to, text)
            );

            // Architecture: Skenario 1, Step 8 — response with "queued" status
            return c.json(
                successResponse({
                    status: "queued",
                    id: result.messageId,
                    to,
                    timestamp: result.timestamp,
                }),
                201
            );
        } catch (err) {
            if (isCircuitBreakerError(err)) {
                return c.json(
                    errorResponse(ErrorCodes.WHATSAPP_DISCONNECTED, "WhatsApp service is currently disconnected"),
                    503
                );
            }
            throw err;
        }
    }
);

// Send media message
messageRoutes.post(
    "/send-media",
    requirePermission("messages:send"),
    zValidator("json", sendMediaMessageSchema),
    async (c) => {
        const { sessionId, to, type, mediaUrl, mediaBase64, caption, filename, mimetype } =
            c.req.valid("json");

        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return c.json(
                errorResponse(ErrorCodes.SESSION_NOT_FOUND, "Session not found"),
                404
            );
        }

        if (!session.isConnected()) {
            return c.json(
                errorResponse(ErrorCodes.SESSION_NOT_CONNECTED, "Session not connected"),
                400
            );
        }

        // Resolve media buffer from either base64 or URL
        let buffer: Buffer;

        if (mediaBase64) {
            buffer = Buffer.from(mediaBase64, "base64");
        } else if (mediaUrl) {
            try {
                const response = await fetch(mediaUrl);
                if (!response.ok) {
                    return c.json(
                        errorResponse(ErrorCodes.VALIDATION_ERROR, `Failed to fetch media from URL: HTTP ${response.status}`),
                        400
                    );
                }
                buffer = Buffer.from(await response.arrayBuffer());
            } catch (err: any) {
                return c.json(
                    errorResponse(ErrorCodes.VALIDATION_ERROR, `Failed to fetch media from URL: ${err.message}`),
                    400
                );
            }
        } else {
            return c.json(
                errorResponse(ErrorCodes.VALIDATION_ERROR, "Either mediaBase64 or mediaUrl is required"),
                400
            );
        }

        // Size validation (5MB max)
        const MAX_MEDIA_SIZE = 5 * 1024 * 1024;
        if (buffer.length > MAX_MEDIA_SIZE) {
            return c.json(
                errorResponse(ErrorCodes.VALIDATION_ERROR, `Media exceeds 5MB limit (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`),
                400
            );
        }

        try {
            // Wrap with circuit breaker (Architecture: Skenario 2 — fast-fail on WA disconnect)
            const result = await breakers.whatsapp.execute(() =>
                session.messaging.sendMedia(to, type, buffer, {
                    caption,
                    filename,
                    mimetype,
                })
            );

            // Architecture: Skenario 1, Step 8 — response with "queued" status
            return c.json(
                successResponse({
                    status: "queued",
                    id: result.messageId,
                    to,
                    type,
                    timestamp: result.timestamp,
                }),
                201
            );
        } catch (err) {
            if (isCircuitBreakerError(err)) {
                return c.json(
                    errorResponse(ErrorCodes.WHATSAPP_DISCONNECTED, "WhatsApp service is currently disconnected"),
                    503
                );
            }
            throw err;
        }
    }
);

// Delete message
messageRoutes.delete(
    "/",
    requirePermission("messages:send"),
    zValidator("json", deleteMessageSchema),
    async (c) => {
        const { sessionId, jid, messageId, fromMe } = c.req.valid("json");

        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return c.json(
                errorResponse(ErrorCodes.SESSION_NOT_FOUND, "Session not found"),
                404
            );
        }

        if (!session.isConnected()) {
            return c.json(
                errorResponse(ErrorCodes.SESSION_NOT_CONNECTED, "Session not connected"),
                400
            );
        }

        await session.messaging.delete(jid, {
            id: messageId,
            fromMe: fromMe ?? true,
            remoteJid: jid,
        });

        return c.json(successResponse({ deleted: true, messageId }));
    }
);
