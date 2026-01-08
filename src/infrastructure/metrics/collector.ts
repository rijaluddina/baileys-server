import { eventBus } from "@infrastructure/events";
import {
    messagesReceivedTotal,
    messagesSentTotal,
    connectionTotal,
    connectionsActive,
    webhookDeliveriesTotal,
} from "@infrastructure/metrics";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "metrics-collector" });

/**
 * Setup event listeners for metrics collection
 */
export function setupMetricsEventListeners(): void {
    // Message metrics
    eventBus.on("message.received", (data) => {
        messagesReceivedTotal.inc({
            session_id: data.sessionId,
            type: data.type,
        });
    });

    eventBus.on("message.sent", (data) => {
        messagesSentTotal.inc({
            session_id: data.sessionId,
            type: "text",
        });
    });

    // Connection metrics
    eventBus.on("connection.open", (data) => {
        connectionTotal.inc({ session_id: data.sessionId, event: "open" });
        connectionsActive.inc({ session_id: data.sessionId });
    });

    eventBus.on("connection.close", (data) => {
        connectionTotal.inc({ session_id: data.sessionId, event: "close" });
        connectionsActive.dec({ session_id: data.sessionId });
    });

    log.info("Metrics event listeners registered");
}
