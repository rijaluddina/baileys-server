import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sessionManager } from "@core/session/session.manager";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { createSessionSchema, sessionIdParamSchema } from "../schemas";

export const sessionRoutes = new Hono();

// Create a new session
sessionRoutes.post(
    "/",
    zValidator("json", createSessionSchema),
    async (c) => {
        const { sessionId, name } = c.req.valid("json");

        const existingSession = await sessionManager.getSession(sessionId);
        if (existingSession) {
            return c.json(
                errorResponse(ErrorCodes.VALIDATION_ERROR, "Session already exists"),
                400
            );
        }

        const session = await sessionManager.createSession(sessionId, name);

        return c.json(
            successResponse({
                sessionId: session.getSessionId(),
                status: "created",
            }),
            201
        );
    }
);

// List all sessions
sessionRoutes.get("/", async (c) => {
    const sessions = await sessionManager.listSessions();
    return c.json(successResponse({ sessions }));
});

// Get session by ID
sessionRoutes.get("/:id", async (c) => {
    const { id } = c.req.param();

    const sessions = await sessionManager.listSessions();
    const sessionInfo = sessions.find((s) => s.id === id);

    if (!sessionInfo) {
        return c.json(
            errorResponse(ErrorCodes.SESSION_NOT_FOUND, "Session not found"),
            404
        );
    }

    const service = await sessionManager.getSession(id);

    return c.json(
        successResponse({
            ...sessionInfo,
            connected: service?.isConnected() ?? false,
        })
    );
});

// Connect session
sessionRoutes.post("/:id/connect", async (c) => {
    const { id } = c.req.param();

    let service = await sessionManager.getSession(id);

    if (!service) {
        // Try to restore session
        service = await sessionManager.restoreSession(id);
    }

    if (!service) {
        return c.json(
            errorResponse(ErrorCodes.SESSION_NOT_FOUND, "Session not found"),
            404
        );
    }

    // Start connection (async, will emit events)
    service.connect().catch((err) => {
        // Connection errors are handled via events
    });

    return c.json(
        successResponse({
            sessionId: id,
            status: "connecting",
            message: "Connection initiated. Watch for QR code via SSE.",
        })
    );
});

// Disconnect/delete session
sessionRoutes.delete("/:id", async (c) => {
    const { id } = c.req.param();

    const session = await sessionManager.getSession(id);
    if (!session) {
        return c.json(
            errorResponse(ErrorCodes.SESSION_NOT_FOUND, "Session not found"),
            404
        );
    }

    await sessionManager.destroySession(id);

    return c.json(successResponse({ sessionId: id, status: "destroyed" }));
});

// Get QR code (returns latest QR if available)
sessionRoutes.get("/:id/qr", async (c) => {
    const { id } = c.req.param();

    const session = await sessionManager.getSession(id);
    if (!session) {
        return c.json(
            errorResponse(ErrorCodes.SESSION_NOT_FOUND, "Session not found"),
            404
        );
    }

    // QR is emitted via events - direct user to SSE
    return c.json(
        successResponse({
            message: "Subscribe to /v1/events/sse for real-time QR updates",
            sessionId: id,
        })
    );
});
