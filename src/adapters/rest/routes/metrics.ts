import { Hono } from "hono";
import { metricsRegistry, sessionsActive, sessionsConnected, queueDepth } from "@infrastructure/metrics";
import { sessionManager } from "@core/session/session.manager";
import { getQueueStats } from "@infrastructure/queue";

export const metricsRoutes = new Hono();

// Prometheus metrics endpoint
metricsRoutes.get("/metrics", async (c) => {
    // Update session gauges
    sessionsActive.set(sessionManager.getActiveCount());
    sessionsConnected.set(sessionManager.getConnectedCount());

    // Update queue gauges
    try {
        const stats = await getQueueStats();
        queueDepth.set({ queue_name: "outgoing", status: "waiting" }, stats.outgoing.waiting);
        queueDepth.set({ queue_name: "outgoing", status: "active" }, stats.outgoing.active);
        queueDepth.set({ queue_name: "incoming", status: "waiting" }, stats.incoming.waiting);
        queueDepth.set({ queue_name: "incoming", status: "active" }, stats.incoming.active);
    } catch {
        // Queue stats may fail if Redis is down
    }

    const metrics = await metricsRegistry.metrics();

    return c.text(metrics, 200, {
        "Content-Type": metricsRegistry.contentType,
    });
});
