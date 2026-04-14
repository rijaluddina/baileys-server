import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sessionManager } from "@core/session/session.manager";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { createGroupSchema, updateGroupSchema, groupParticipantsSchema, batchParticipantsSchema } from "../schemas";
import { requirePermission } from "../auth.middleware";

export const groupRoutes = new Hono();

// Create group
groupRoutes.post(
    "/",
    requirePermission("sessions:control"),
    zValidator("json", createGroupSchema),
    async (c) => {
        const { sessionId, subject, participants } = c.req.valid("json");

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

        const group = await session.groups.create({ subject, participants });

        return c.json(
            successResponse({
                groupId: group.id,
                subject: group.subject,
                participants: group.participants.length,
            }),
            201
        );
    }
);

// Get group metadata
groupRoutes.get("/:id", requirePermission("data:read"), async (c) => {
    const id = c.req.param("id");
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

    const metadata = await session.groups.getMetadata(id);

    return c.json(
        successResponse({
            id: metadata.id,
            subject: metadata.subject,
            desc: metadata.desc,
            owner: metadata.owner,
            participants: metadata.participants.map((p) => ({
                id: p.id,
                admin: p.admin,
            })),
            creation: metadata.creation,
            announce: metadata.announce,
            restrict: metadata.restrict,
        })
    );
});

// Update group
groupRoutes.patch(
    "/:id",
    requirePermission("sessions:control"),
    zValidator("json", updateGroupSchema),
    async (c) => {
        const id = c.req.param("id");
        const { sessionId, subject, description } = c.req.valid("json");

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

        if (subject) {
            await session.groups.updateSubject(id, subject);
        }

        if (description !== undefined) {
            await session.groups.updateDescription(id, description);
        }

        return c.json(successResponse({ groupId: id, updated: true }));
    }
);

// Manage participants
groupRoutes.post(
    "/:id/participants",
    requirePermission("sessions:control"),
    zValidator("json", groupParticipantsSchema),
    async (c) => {
        const id = c.req.param("id");
        const { sessionId, action, participants } = c.req.valid("json");

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

        switch (action) {
            case "add":
                await session.groups.addParticipants(id, participants);
                break;
            case "remove":
                await session.groups.removeParticipants(id, participants);
                break;
            case "promote":
                await session.groups.promoteToAdmin(id, participants);
                break;
            case "demote":
                await session.groups.demoteFromAdmin(id, participants);
                break;
        }

        return c.json(
            successResponse({
                groupId: id,
                action,
                participants,
                success: true,
            })
        );
    }
);

// Leave group
groupRoutes.delete("/:id/leave", requirePermission("sessions:control"), async (c) => {
    const id = c.req.param("id");
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

    await session.groups.leave(id);

    return c.json(successResponse({ groupId: id, left: true }));
});

// Batch participant operations (add/remove many at once)
groupRoutes.post(
    "/:id/participants/batch",
    requirePermission("sessions:control"),
    zValidator("json", batchParticipantsSchema),
    async (c) => {
        const id = c.req.param("id");
        const { sessionId, action, participants, delayMs } = c.req.valid("json");

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

        const result = action === "add"
            ? await session.groups.batchAddParticipants(id, participants, { delayMs })
            : await session.groups.batchRemoveParticipants(id, participants, { delayMs });

        return c.json(
            successResponse({
                groupId: id,
                action,
                totalBatches: result.totalBatches,
                succeeded: result.success.length,
                failed: result.failed.length,
                success: result.success,
                failures: result.failed,
            })
        );
    }
);

// Get invite code
groupRoutes.get("/:id/invite", requirePermission("data:read"), async (c) => {
    const id = c.req.param("id");
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

    const code = await session.groups.getInviteCode(id);

    return c.json(
        successResponse({
            groupId: id,
            inviteCode: code,
            inviteUrl: code ? `https://chat.whatsapp.com/${code}` : null,
        })
    );
});
