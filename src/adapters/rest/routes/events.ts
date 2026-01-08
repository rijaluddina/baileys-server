import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eventBus, type EventName } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

export const eventsRoutes = new Hono();

const log = logger.child({ component: "sse" });

// SSE endpoint for real-time events
eventsRoutes.get("/sse", async (c) => {
    const sessionId = c.req.query("sessionId");

    return streamSSE(c, async (stream) => {
        log.info({ sessionId }, "SSE client connected");

        // Helper to send SSE event
        const sendEvent = (event: string, data: unknown) => {
            stream.writeSSE({
                event,
                data: JSON.stringify(data),
            });
        };

        // Event handlers
        const handlers: Record<string, (data: any) => void> = {
            "connection.open": (data) => {
                if (!sessionId || data.sessionId === sessionId) {
                    sendEvent("connection.open", data);
                }
            },
            "connection.close": (data) => {
                if (!sessionId || data.sessionId === sessionId) {
                    sendEvent("connection.close", data);
                }
            },
            "qr.update": (data) => {
                if (!sessionId || data.sessionId === sessionId) {
                    sendEvent("qr.update", data);
                }
            },
            "message.received": (data) => {
                if (!sessionId || data.sessionId === sessionId) {
                    sendEvent("message.received", {
                        sessionId: data.sessionId,
                        type: data.type,
                        from: data.message.key.remoteJid,
                        messageId: data.message.key.id,
                        timestamp: data.message.messageTimestamp,
                    });
                }
            },
            "message.sent": (data) => {
                if (!sessionId || data.sessionId === sessionId) {
                    sendEvent("message.sent", data);
                }
            },
            "message.status": (data) => {
                if (!sessionId || data.sessionId === sessionId) {
                    sendEvent("message.status", data);
                }
            },
            "contact.updated": (data) => {
                if (!sessionId || data.sessionId === sessionId) {
                    sendEvent("contact.updated", {
                        sessionId: data.sessionId,
                        count: data.contacts.length,
                    });
                }
            },
            "group.updated": (data) => {
                if (!sessionId || data.sessionId === sessionId) {
                    sendEvent("group.updated", data);
                }
            },
            "presence.updated": (data) => {
                if (!sessionId || data.sessionId === sessionId) {
                    sendEvent("presence.updated", data);
                }
            },
        };

        // Register all handlers
        for (const [event, handler] of Object.entries(handlers)) {
            eventBus.on(event as EventName, handler);
        }

        // Send initial ping
        sendEvent("ping", { timestamp: Date.now() });

        // Heartbeat
        const heartbeat = setInterval(() => {
            sendEvent("ping", { timestamp: Date.now() });
        }, 30000);

        // Wait for connection close
        try {
            while (true) {
                await stream.sleep(1000);
            }
        } finally {
            // Cleanup
            clearInterval(heartbeat);
            for (const [event, handler] of Object.entries(handlers)) {
                eventBus.off(event as EventName, handler);
            }
            log.info({ sessionId }, "SSE client disconnected");
        }
    });
});
