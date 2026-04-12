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

// Update API key schema
const updateApiKeySchema = z.object({
    name: z.string().min(1).max(100).optional(),
    role: z.enum(["viewer", "operator", "admin"]).optional(),
    sessionIds: z.array(z.string()).optional(),
    rateLimit: z.number().int().positive().optional(),
    active: z.boolean().optional(),
});

// Rotate API key schema
const rotateApiKeySchema = z.object({
    immediate: z.boolean().default(false).optional(),
    gracePeriodHours: z.number().min(0).max(720).default(24).optional(),
});

// Create new API key (admin only)
adminRoutes.post(
    "/api-keys",
    requirePermission("admin:write"),
    zValidator("json", createApiKeySchema),
    async (c) => {
        const { name, role, sessionIds, rateLimit, expiresInDays } = c.req.valid("json");
        const auth = c.get("auth");
        
        const createdBy = auth?.userId || auth?.keyId || undefined;

        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : undefined;

        const result = await authService.createApiKey(name, role, {
            sessionIds,
            rateLimit,
            expiresAt,
            createdBy,
            organizationId: auth?.organizationId ?? undefined,
            userId: auth?.userId ?? undefined,
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
        const auth = c.get("auth");
        const keys = await authService.listKeys(auth?.organizationId ?? undefined);

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

// Get single API key (admin only)
adminRoutes.get(
    "/api-keys/:id",
    requirePermission("admin:read"),
    async (c) => {
        const { id } = c.req.param();
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Key ID required"), 400);

        const key = await authService.getKeyById(id);
        if (!key) return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Key not found"), 404);

        const auth = c.get("auth");
        if (key.organizationId !== auth?.organizationId && auth?.organizationId) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Key not found"), 404);
        }

        return c.json(successResponse({ key }));
    }
);

// Update API key (admin only)
adminRoutes.patch(
    "/api-keys/:id",
    requirePermission("admin:write"),
    zValidator("json", updateApiKeySchema),
    async (c) => {
        const { id } = c.req.param();
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Key ID required"), 400);

        const auth = c.get("auth");
        const existingKey = await authService.getKeyById(id);
        if (!existingKey || (existingKey.organizationId !== auth?.organizationId && auth?.organizationId)) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Key not found"), 404);
        }

        const updates = c.req.valid("json");
        const key = await authService.updateKey(id, updates);
        
        if (!key) return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Key not found"), 404);

        return c.json(successResponse({ key }));
    }
);

// Rotate API key (admin only)
adminRoutes.post(
    "/api-keys/:id/rotate",
    requirePermission("admin:write"),
    zValidator("json", rotateApiKeySchema),
    async (c) => {
        const { id } = c.req.param();
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Key ID required"), 400);

        const auth = c.get("auth");
        const existingKey = await authService.getKeyById(id);
        if (!existingKey || (existingKey.organizationId !== auth?.organizationId && auth?.organizationId)) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Key not found"), 404);
        }

        const options = c.req.valid("json");
        const result = await authService.rotateKey(id, options);

        if (!result) return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Key not found"), 404);

        return c.json(
            successResponse({
                key: result.key, // Only returned once!
                info: result.info,
                message: "Store this new key securely. It will not be shown again.",
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

        const auth = c.get("auth");
        const existingKey = await authService.getKeyById(id);
        if (!existingKey || (existingKey.organizationId !== auth?.organizationId && auth?.organizationId)) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Key not found"), 404);
        }

        await authService.revokeKey(id);

        return c.json(successResponse({ id, revoked: true }));
    }
);

// Get current key info
adminRoutes.get("/me", async (c) => {
    const auth = c.get("auth");
    
    // For backwards compatibility and giving current context
    if (!auth || !auth.isAuthenticated) {
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
            id: auth.userId || auth.keyId,
            role: auth.role,
            organizationId: auth.organizationId,
            permissions: auth.permissions,
        })
    );
});
