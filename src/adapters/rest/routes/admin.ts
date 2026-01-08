import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authService } from "@core/auth";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { requirePermission } from "../auth.middleware";

export const adminRoutes = new Hono();

// Create API key schema
const createApiKeySchema = z.object({
    name: z.string().min(1).max(100),
    role: z.enum(["viewer", "operator", "admin"]).default("operator"),
    sessionIds: z.array(z.string()).optional(),
    rateLimit: z.number().int().positive().optional(),
    expiresInDays: z.number().int().positive().optional(),
});

// Create new API key (admin only)
adminRoutes.post(
    "/api-keys",
    requirePermission("admin:write"),
    zValidator("json", createApiKeySchema),
    async (c) => {
        const { name, role, sessionIds, rateLimit, expiresInDays } = c.req.valid("json");
        const createdBy = c.get("apiKey")?.id;

        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : undefined;

        const result = await authService.createApiKey(name, role, {
            sessionIds,
            rateLimit,
            expiresAt,
            createdBy,
        });

        return c.json(
            successResponse({
                key: result.key, // Only returned once!
                id: result.info.id,
                name: result.info.name,
                role: result.info.role,
                message: "Store this key securely. It will not be shown again.",
            }),
            201
        );
    }
);

// List API keys (admin only)
adminRoutes.get(
    "/api-keys",
    requirePermission("admin:read"),
    async (c) => {
        const keys = await authService.listKeys();

        return c.json(
            successResponse({
                keys: keys.map((k) => ({
                    id: k.id,
                    name: k.name,
                    role: k.role,
                    active: k.active,
                    rateLimit: k.rateLimit,
                    sessionCount: k.sessionIds.length || "all",
                })),
            })
        );
    }
);

// Revoke API key (admin only)
adminRoutes.delete(
    "/api-keys/:id",
    requirePermission("admin:write"),
    async (c) => {
        const { id } = c.req.param();

        if (!id) {
            return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Key ID required"), 400);
        }
        await authService.revokeKey(id);

        return c.json(successResponse({ id, revoked: true }));
    }
);

// Get current key info
adminRoutes.get("/me", async (c) => {
    const keyInfo = c.get("apiKey");

    if (!keyInfo) {
        return c.json(
            successResponse({
                authenticated: false,
                mode: "development",
            })
        );
    }

    return c.json(
        successResponse({
            authenticated: true,
            id: keyInfo.id,
            name: keyInfo.name,
            role: keyInfo.role,
            rateLimit: keyInfo.rateLimit,
            sessionAccess: keyInfo.sessionIds.length === 0 ? "all" : keyInfo.sessionIds,
        })
    );
});
