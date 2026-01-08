import { Hono } from "hono";
import { sessionManager } from "@core/session/session.manager";

export const healthRoutes = new Hono();

healthRoutes.get("/health", async (c) => {
    const health = sessionManager.getAllHealth();

    return c.json({
        success: true,
        data: {
            status: "ok",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            sessions: {
                active: sessionManager.getActiveCount(),
                connected: sessionManager.getConnectedCount(),
            },
            instances: health.map((h) => ({
                sessionId: h.sessionId,
                status: h.status,
                connected: h.connected,
                uptime: h.uptime,
            })),
        },
    });
});

healthRoutes.get("/health/live", (c) => {
    return c.json({ success: true, data: { status: "live" } });
});

healthRoutes.get("/health/ready", async (c) => {
    try {
        await sessionManager.listSessions();
        return c.json({ success: true, data: { status: "ready" } });
    } catch {
        return c.json({ success: false, data: { status: "not_ready" } }, 503);
    }
});
