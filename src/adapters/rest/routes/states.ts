import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { conversationStateService } from "@core/conversation";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { requirePermission } from "../auth.middleware";

export const stateRoutes = new Hono();

// Update state schema
const updateStateSchema = z.object({
    context: z.record(z.unknown()).optional(),
    history: z
        .array(
            z.object({
                role: z.string(),
                content: z.string(),
                timestamp: z.string().optional(),
            })
        )
        .optional(),
    metadata: z.record(z.unknown()).optional(),
    agentId: z.string().optional(),
    ttlMinutes: z.number().int().positive().optional(),
});

// Get state
stateRoutes.get(
    "/:sessionId/:jid",
    requirePermission("messages:read"),
    async (c) => {
        const sessionId = c.req.param("sessionId");
        const jid = c.req.param("jid");

        if (!sessionId || !jid) {
            return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "sessionId and jid required"), 400);
        }

        const state = await conversationStateService.get(sessionId, jid);

        if (!state) {
            return c.json(
                successResponse({
                    exists: false,
                    sessionId,
                    jid,
                    context: {},
                    history: [],
                })
            );
        }

        return c.json(
            successResponse({
                exists: true,
                id: state.id,
                sessionId: state.sessionId,
                jid: state.jid,
                agentId: state.agentId,
                context: state.context,
                history: state.history,
                metadata: state.metadata,
                version: state.version,
                expiresAt: state.expiresAt,
                createdAt: state.createdAt,
                updatedAt: state.updatedAt,
            })
        );
    }
);

// Update state
stateRoutes.put(
    "/:sessionId/:jid",
    requirePermission("messages:write"),
    zValidator("json", updateStateSchema),
    async (c) => {
        const sessionId = c.req.param("sessionId");
        const jid = c.req.param("jid");

        if (!sessionId || !jid) {
            return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "sessionId and jid required"), 400);
        }

        const data = c.req.valid("json");

        // Build update object with proper types
        const update: {
            context?: Record<string, unknown>;
            history?: Array<{ role: string; content: string; timestamp: string }>;
            metadata?: Record<string, unknown>;
            agentId?: string;
            ttlMinutes?: number;
        } = {
            context: data.context,
            metadata: data.metadata,
            agentId: data.agentId,
            ttlMinutes: data.ttlMinutes,
        };

        // Add timestamps to history if not present
        if (data.history) {
            update.history = data.history.map((h) => ({
                role: h.role,
                content: h.content,
                timestamp: h.timestamp || new Date().toISOString(),
            }));
        }

        const state = await conversationStateService.update(sessionId, jid, update);

        return c.json(
            successResponse({
                id: state.id,
                version: state.version,
                updatedAt: state.updatedAt,
            })
        );
    }
);

// Clear state
stateRoutes.delete(
    "/:sessionId/:jid",
    requirePermission("messages:write"),
    async (c) => {
        const sessionId = c.req.param("sessionId");
        const jid = c.req.param("jid");

        if (!sessionId || !jid) {
            return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "sessionId and jid required"), 400);
        }

        await conversationStateService.clear(sessionId, jid);

        return c.json(successResponse({ cleared: true, sessionId, jid }));
    }
);

// List states for session
stateRoutes.get("/:sessionId", requirePermission("messages:read"), async (c) => {
    const sessionId = c.req.param("sessionId");

    if (!sessionId) {
        return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "sessionId required"), 400);
    }

    const states = await conversationStateService.listBySession(sessionId);

    return c.json(
        successResponse({
            sessionId,
            count: states.length,
            states: states.map((s) => ({
                jid: s.jid,
                agentId: s.agentId,
                historyCount: (s.history as Array<unknown>)?.length ?? 0,
                updatedAt: s.updatedAt,
            })),
        })
    );
});
