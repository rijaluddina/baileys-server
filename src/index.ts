import { apiRouter } from "@adapters/rest";
import { sessionManager } from "@core/session/session.manager";
import { startQueues, stopQueues } from "@infrastructure/queue";
import { logger } from "@infrastructure/logger";
import { eventBus } from "@infrastructure/events";

const port = Number(process.env.PORT) || 3000;
const log = logger.child({ component: "main" });

// Event logging
eventBus.on("connection.open", (data) => {
    log.info(data, "WhatsApp connection opened");
});

eventBus.on("connection.close", (data) => {
    log.warn(data, "WhatsApp connection closed");
});

eventBus.on("qr.update", (data) => {
    log.info({ sessionId: data.sessionId }, "QR code updated");
});

eventBus.on("message.received", (data) => {
    log.info(
        { sessionId: data.sessionId, from: data.message.key.remoteJid, type: data.type },
        "Message received"
    );
});

// Graceful shutdown handlers
async function gracefulShutdown(signal: string): Promise<void> {
    log.info({ signal }, "Received shutdown signal");

    try {
        stopQueues();
        await sessionManager.shutdown();
        log.info("Graceful shutdown complete");
        process.exit(0);
    } catch (err) {
        log.error({ err }, "Error during shutdown");
        process.exit(1);
    }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Startup
async function startup(): Promise<void> {
    log.info({ port }, "Starting WhatsApp Server");

    // Start message queues
    startQueues();

    // Restore sessions from database
    const autoConnect = process.env.AUTO_CONNECT_SESSIONS === "true";
    await sessionManager.restoreAllSessions(autoConnect);

    log.info(
        {
            active: sessionManager.getActiveCount(),
            connected: sessionManager.getConnectedCount(),
        },
        "Startup complete"
    );
}

// Run startup
startup().catch((err) => {
    log.error({ err }, "Startup failed");
    process.exit(1);
});

export default {
    port,
    fetch: apiRouter.fetch,
};
