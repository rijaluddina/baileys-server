import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { webhookService } from "@core/webhook";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { requirePermission } from "../auth.middleware";

export const webhookRoutes = new Hono();

// Create webhook schema
const createWebhookSchema = z.object({
    name: z.string().min(1).max(100),
    url: z.string().url(),
    events: z.array(z.string()).optional(),
    sessionIds: z.array(z.string()).optional(),
    retries: z.number().int().min(0).max(10).optional(),
    timeoutMs: z.number().int().min(1000).max(60000).optional(),
});

// Update webhook schema
const updateWebhookSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    url: z.string().url().optional(),
    events: z.array(z.string()).optional(),
    sessionIds: z.array(z.string()).optional(),
    active: z.boolean().optional(),
});

// Create new webhook (admin only)
webhookRoutes.post(
    "/",
    requirePermission("admin:write"),
    zValidator("json", createWebhookSchema),
    async (c) => {
        const data = c.req.valid("json");
        const result = await webhookService.create(data);

        return c.json(
            successResponse({
                id: result.id,
                secret: result.secret,
                message: "Store the secret securely. It will not be shown again.",
            }),
            201
        );
    }
);

// List webhooks
webhookRoutes.get("/", requirePermission("admin:read"), async (c) => {
    const webhooks = await webhookService.list();

    return c.json(
        successResponse({
            webhooks: webhooks.map((w) => ({
                id: w.id,
                name: w.name,
                url: w.url,
                events: w.events,
                sessionIds: w.sessionIds,
                active: w.active,
                deliveryCount: w.deliveryCount,
                failureCount: w.failureCount,
                lastDeliveryAt: w.lastDeliveryAt,
                lastDeliveryStatus: w.lastDeliveryStatus,
            })),
        })
    );
});

// Get webhook by ID
webhookRoutes.get("/:id", requirePermission("admin:read"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "ID required"), 400);
    const webhook = await webhookService.get(id);

    if (!webhook) {
        return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Webhook not found"), 404);
    }

    return c.json(
        successResponse({
            id: webhook.id,
            name: webhook.name,
            url: webhook.url,
            events: webhook.events,
            sessionIds: webhook.sessionIds,
            active: webhook.active,
            retries: webhook.retries,
            timeoutMs: webhook.timeoutMs,
            deliveryCount: webhook.deliveryCount,
            failureCount: webhook.failureCount,
            lastDeliveryAt: webhook.lastDeliveryAt,
            lastDeliveryStatus: webhook.lastDeliveryStatus,
            createdAt: webhook.createdAt,
            updatedAt: webhook.updatedAt,
        })
    );
});

// Update webhook
webhookRoutes.patch(
    "/:id",
    requirePermission("admin:write"),
    zValidator("json", updateWebhookSchema),
    async (c) => {
        const id = c.req.param("id");
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "ID required"), 400);
        const data = c.req.valid("json");

        const webhook = await webhookService.get(id);
        if (!webhook) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Webhook not found"), 404);
        }

        await webhookService.update(id, data);
        return c.json(successResponse({ id, updated: true }));
    }
);

// Delete webhook
webhookRoutes.delete("/:id", requirePermission("admin:write"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "ID required"), 400);

    const webhook = await webhookService.get(id);
    if (!webhook) {
        return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Webhook not found"), 404);
    }

    await webhookService.delete(id);
    return c.json(successResponse({ id, deleted: true }));
});

// Get queue stats
webhookRoutes.get("/queue/stats", requirePermission("admin:read"), async (c) => {
    const stats = await webhookService.getQueueStats();
    return c.json(successResponse({ queue: stats }));
});
