import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sessionManager } from "@core/session/session.manager";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { contactActionSchema } from "../schemas";

export const contactRoutes = new Hono();

// List contacts
contactRoutes.get("/", async (c) => {
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

    const contacts = await session.contacts.getContacts();

    return c.json(
        successResponse({
            contacts: contacts.map((c) => ({
                id: c.id,
                name: c.name,
                notify: c.notify,
            })),
        })
    );
});

// Get contact profile
contactRoutes.get("/:jid", async (c) => {
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

    const profile = await session.contacts.getProfile(jid);

    return c.json(successResponse({ profile }));
});

// Check if number is on WhatsApp
contactRoutes.get("/:jid/check", async (c) => {
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

    const result = await session.contacts.isOnWhatsApp(jid);

    return c.json(successResponse(result));
});

// Block contact
contactRoutes.post(
    "/:jid/block",
    zValidator("json", contactActionSchema),
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

        await session.contacts.block(jid);

        return c.json(successResponse({ jid, blocked: true }));
    }
);

// Unblock contact
contactRoutes.post(
    "/:jid/unblock",
    zValidator("json", contactActionSchema),
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

        await session.contacts.unblock(jid);

        return c.json(successResponse({ jid, blocked: false }));
    }
);
