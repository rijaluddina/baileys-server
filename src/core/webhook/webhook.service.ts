import { eq, and, inArray } from "drizzle-orm";
import { db } from "@infrastructure/database";
import { webhooks, type Webhook, type NewWebhook } from "@infrastructure/database/schema";
import { RedisQueue } from "@infrastructure/queue/redis-queue";
import { eventBus, type EventPayloads } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "webhook-service" });

export interface WebhookPayload {
    id: string;
    event: string;
    timestamp: string;
    sessionId: string;
    data: unknown;
    signature: string;
}

export interface WebhookDeliveryJob {
    webhookId: string;
    url: string;
    payload: WebhookPayload;
    secret: string;
    timeoutMs: number;
}

// Webhook delivery queue
const webhookQueue = new RedisQueue<WebhookDeliveryJob>("webhook-delivery", {
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
    },
});

/**
 * Generate HMAC signature for webhook payload
 */
async function signPayload(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const hashArray = Array.from(new Uint8Array(signature));
    return "sha256=" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Webhook delivery processor
 */
async function deliverWebhook(job: { data: WebhookDeliveryJob }): Promise<void> {
    const { webhookId, url, payload, secret, timeoutMs } = job.data;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const body = JSON.stringify(payload);
        const signature = await signPayload(body, secret);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
                "X-Webhook-Id": webhookId,
                "X-Event-Type": payload.event,
            },
            body,
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Update success stats
        await db
            .update(webhooks)
            .set({
                lastDeliveryAt: new Date(),
                lastDeliveryStatus: "success",
                deliveryCount: (await db.select().from(webhooks).where(eq(webhooks.id, webhookId)))[0]
                    ?.deliveryCount ?? 0 + 1,
                updatedAt: new Date(),
            })
            .where(eq(webhooks.id, webhookId));

        log.debug({ webhookId, url, event: payload.event }, "Webhook delivered successfully");
    } catch (err: any) {
        // Update failure stats
        await db
            .update(webhooks)
            .set({
                lastDeliveryAt: new Date(),
                lastDeliveryStatus: `failed: ${err.message}`,
                failureCount: (await db.select().from(webhooks).where(eq(webhooks.id, webhookId)))[0]
                    ?.failureCount ?? 0 + 1,
                updatedAt: new Date(),
            })
            .where(eq(webhooks.id, webhookId));

        log.warn({ webhookId, url, error: err.message }, "Webhook delivery failed");
        throw err; // Re-throw for retry
    } finally {
        clearTimeout(timeout);
    }
}

class WebhookService {
    /**
     * Create a new webhook
     */
    async create(data: {
        name: string;
        url: string;
        events?: string[];
        sessionIds?: string[];
        retries?: number;
        timeoutMs?: number;
    }): Promise<{ id: string; secret: string }> {
        const id = crypto.randomUUID();
        const secret = `whsec_${crypto.randomUUID().replace(/-/g, "")}`;

        await db.insert(webhooks).values({
            id,
            name: data.name,
            url: data.url,
            secret,
            events: data.events ?? [],
            sessionIds: data.sessionIds ?? [],
            retries: data.retries ?? 3,
            timeoutMs: data.timeoutMs ?? 10000,
        });

        log.info({ id, name: data.name, url: data.url }, "Webhook created");

        return { id, secret };
    }

    /**
     * List all webhooks
     */
    async list(): Promise<Webhook[]> {
        return db.select().from(webhooks);
    }

    /**
     * Get webhook by ID
     */
    async get(id: string): Promise<Webhook | null> {
        const [result] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
        return result || null;
    }

    /**
     * Update webhook
     */
    async update(
        id: string,
        data: Partial<{ name: string; url: string; events: string[]; sessionIds: string[]; active: boolean }>
    ): Promise<void> {
        await db
            .update(webhooks)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(webhooks.id, id));
    }

    /**
     * Delete webhook
     */
    async delete(id: string): Promise<void> {
        await db.delete(webhooks).where(eq(webhooks.id, id));
        log.info({ id }, "Webhook deleted");
    }

    /**
     * Dispatch an event to all matching webhooks
     */
    async dispatch(event: string, sessionId: string, data: unknown): Promise<void> {
        const allWebhooks = await db
            .select()
            .from(webhooks)
            .where(eq(webhooks.active, true));

        for (const webhook of allWebhooks) {
            // Filter by event type
            const events = webhook.events as string[];
            if (events.length > 0 && !events.includes(event)) {
                continue;
            }

            // Filter by session
            const sessions = webhook.sessionIds as string[];
            if (sessions.length > 0 && !sessions.includes(sessionId)) {
                continue;
            }

            const payload: WebhookPayload = {
                id: crypto.randomUUID(),
                event,
                timestamp: new Date().toISOString(),
                sessionId,
                data,
                signature: "", // Will be computed during delivery
            };

            await webhookQueue.add("deliver", {
                webhookId: webhook.id,
                url: webhook.url,
                payload,
                secret: webhook.secret,
                timeoutMs: webhook.timeoutMs ?? 10000,
            });
        }
    }

    /**
     * Start webhook delivery worker
     */
    startWorker(): void {
        webhookQueue.startWorker(deliverWebhook, { concurrency: 10 });
        log.info("Webhook delivery worker started");
    }

    /**
     * Stop webhook delivery worker
     */
    async stopWorker(): Promise<void> {
        await webhookQueue.close();
        log.info("Webhook delivery worker stopped");
    }

    /**
     * Get queue stats
     */
    async getQueueStats() {
        return webhookQueue.getStats();
    }
}

export const webhookService = new WebhookService();

// Subscribe to events and dispatch to webhooks
const WEBHOOK_EVENTS: (keyof EventPayloads)[] = [
    "message.received",
    "message.sent",
    "message.status",
    "connection.open",
    "connection.close",
    "qr.update",
];

export function setupWebhookEventListeners(): void {
    for (const event of WEBHOOK_EVENTS) {
        eventBus.on(event, async (data: any) => {
            const sessionId = data.sessionId || "unknown";
            await webhookService.dispatch(event, sessionId, data);
        });
    }
    log.info({ events: WEBHOOK_EVENTS }, "Webhook event listeners registered");
}
