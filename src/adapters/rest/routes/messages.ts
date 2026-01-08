import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sessionManager } from "@core/session/session.manager";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { sendTextMessageSchema, sendMediaMessageSchema, deleteMessageSchema } from "../schemas";

export const messageRoutes = new Hono();

// Send text message
messageRoutes.post(
    "/send",
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

        const result = await session.messaging.sendText(to, text);

        return c.json(
            successResponse({
                messageId: result.messageId,
                to,
                timestamp: result.timestamp,
            }),
            201
        );
    }
);

// Send media message
messageRoutes.post(
    "/send-media",
    zValidator("json", sendMediaMessageSchema),
    async (c) => {
        const { sessionId, to, type, mediaBase64, caption, filename, mimetype } =
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

        if (!mediaBase64) {
            return c.json(
                errorResponse(ErrorCodes.VALIDATION_ERROR, "mediaBase64 is required"),
                400
            );
        }

        const buffer = Buffer.from(mediaBase64, "base64");
        const result = await session.messaging.sendMedia(to, type, buffer, {
            caption,
            filename,
            mimetype,
        });

        return c.json(
            successResponse({
                messageId: result.messageId,
                to,
                type,
                timestamp: result.timestamp,
            }),
            201
        );
    }
);

// Delete message
messageRoutes.delete(
    "/",
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
