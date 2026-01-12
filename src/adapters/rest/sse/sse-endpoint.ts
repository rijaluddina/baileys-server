/**
 * Server-Sent Events (SSE) for Real-time Events
 * - Keep-alive mechanism
 * - Event filtering
 * - Simple GET endpoint
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eventBus } from "@infrastructure/events";

type WhatsAppEvent = "message.received" | "message.sent" | "message.status" | "connection.open" | "connection.close" | "qr.update";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "sse" });

const sseRoutes = new Hono();

/**
 * GET /sessions/:sessionId/events/sse
 * Server-Sent Events stream
 */
sseRoutes.get("/:sessionId/events/sse", async (c) => {
    const sessionId = c.req.param("sessionId");
    const eventsParam = c.req.query("events");

    // Parse event filter
    const subscribedEvents = eventsParam
        ? new Set(eventsParam.split(","))
        : null; // null = all events

    log.info({ sessionId, events: subscribedEvents }, "SSE client connected");

    return streamSSE(c, async (stream) => {
        // Keep-alive interval
        const keepAlive = setInterval(() => {
            stream.writeSSE({ data: "", event: "keep-alive" });
        }, 30000);

        // Event handler
        const handler = (data: any) => {
            stream.writeSSE({
                event: data.eventType || "message",
                data: JSON.stringify(data),
                id: Date.now().toString(),
            });
        };

        // Subscribe to events
        const events: WhatsAppEvent[] = [
            "message.received",
            "message.sent",
            "message.status",
            "connection.open",
            "connection.close",
            "qr.update",
        ];

        for (const event of events) {
            if (!subscribedEvents || subscribedEvents.has(event)) {
                eventBus.on(event, (eventData) => {
                    if (eventData.sessionId === sessionId) {
                        handler({ eventType: event, ...eventData });
                    }
                });
            }
        }

        // Send initial connection event
        await stream.writeSSE({
            event: "connected",
            data: JSON.stringify({ sessionId, timestamp: Date.now() }),
        });

        // Keep stream open
        try {
            await stream.sleep(Number.MAX_SAFE_INTEGER);
        } finally {
            clearInterval(keepAlive);
            log.info({ sessionId }, "SSE client disconnected");
        }
    });
});

export { sseRoutes };
