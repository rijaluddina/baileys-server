import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sessionManager } from "@core/session/session.manager";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { updatePresenceSchema, subscribePresenceSchema } from "../schemas";

export const presenceRoutes = new Hono();

// Update own presence
presenceRoutes.post(
    "/update",
    zValidator("json", updatePresenceSchema),
    async (c) => {
        const { sessionId, presence } = c.req.valid("json");

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

        await session.presence.setPresence(presence);

        return c.json(successResponse({ presence, updated: true }));
    }
);

// Subscribe to presence updates for a JID
presenceRoutes.post(
    "/:jid/subscribe",
    zValidator("json", subscribePresenceSchema),
    async (c) => {
        const { jid } = c.req.param();
        const { sessionId } = c.req.valid("json");

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

        await session.presence.subscribe(jid);

        return c.json(
            successResponse({
                jid,
                subscribed: true,
                message: "Presence updates will be sent via SSE",
            })
        );
    }
);

// Send typing indicator
presenceRoutes.post("/:jid/typing", async (c) => {
    const { jid } = c.req.param();
    const sessionId = c.req.query("sessionId");

    if (!sessionId) {
        return c.json(
            errorResponse(ErrorCodes.VALIDATION_ERROR, "sessionId query param required"),
            400
        );
    }

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

    await session.presence.showTyping(jid);

    return c.json(successResponse({ jid, typing: true }));
});
