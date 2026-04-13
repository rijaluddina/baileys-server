/**
 * Message Status Event Listener
 *
 * Subscribes to event bus events and feeds them into MessageStatusService.
 * Registered at application startup.
 *
 * Architecture ref: Skenario 1
 *   - message.sent  → track as "queued"
 *   - message.status → update to delivered/read
 */

import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";
import { messageStatusService } from "./message-status.service";

const log = logger.child({ component: "message-status-listener" });

/**
 * Map receipt status from event bus to our status type
 */
function mapEventStatus(status: string): "sent" | "delivered" | "read" | null {
    switch (status) {
        case "sent":
            return "sent";
        case "delivered":
            return "delivered";
        case "read":
        case "played":
            return "read";
        default:
            return null;
    }
}

/**
 * Register message status event listeners.
 * Should be called once during application startup.
 */
export function setupMessageStatusListeners(): void {
    // Track every outgoing message
    eventBus.on("message.sent", async (data) => {
        await messageStatusService.trackSent({
            messageId: data.messageId,
            sessionId: data.sessionId,
            to: data.to,
            type: data.type,
        });
    });

    // Update status when WhatsApp sends receipt updates (delivered/read)
    eventBus.on("message.status", async (data) => {
        const status = mapEventStatus(data.status);
        if (!status) {
            log.debug({ messageId: data.messageId, rawStatus: data.status }, "Unknown status, skipping");
            return;
        }

        await messageStatusService.updateStatus(data.messageId, status);
    });

    log.info("Message status event listeners registered");
}
