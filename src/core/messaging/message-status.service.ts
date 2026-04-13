/**
 * Message Status Service
 *
 * Persists sent message records and handles async status updates
 * from WhatsApp (queued → sent → delivered → read).
 *
 * Architecture ref: Skenario 1, Step 12
 *   WA → REST: Event message-receipt.update
 *   REST → DB: Update status pesan (msg_123 = delivered)
 */

import { eq } from "drizzle-orm";
import { db } from "@infrastructure/database";
import { sentMessages, type NewSentMessage, type SentMessage } from "@infrastructure/database/schema";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "message-status-service" });

export type MessageStatus = "queued" | "sent" | "delivered" | "read";

/**
 * Status priority for idempotent updates.
 * A status can only move forward, never backward.
 */
const STATUS_PRIORITY: Record<MessageStatus, number> = {
    queued: 0,
    sent: 1,
    delivered: 2,
    read: 3,
};

export class MessageStatusService {
    /**
     * Record a newly sent message with status "queued"
     */
    async trackSent(data: {
        messageId: string;
        sessionId: string;
        to: string;
        type: string;
    }): Promise<void> {
        try {
            await db.insert(sentMessages).values({
                id: data.messageId,
                sessionId: data.sessionId,
                to: data.to,
                type: data.type,
                status: "queued",
            }).onConflictDoNothing();

            log.debug({ messageId: data.messageId, to: data.to }, "Message tracked as queued");
        } catch (err) {
            log.error({ err, messageId: data.messageId }, "Failed to track sent message");
        }
    }

    /**
     * Update message status (idempotent, forward-only).
     * Ignores updates that would regress the status.
     */
    async updateStatus(messageId: string, newStatus: MessageStatus): Promise<void> {
        try {
            // Fetch current status
            const [existing] = await db
                .select({ status: sentMessages.status })
                .from(sentMessages)
                .where(eq(sentMessages.id, messageId))
                .limit(1);

            if (!existing) {
                log.debug({ messageId, newStatus }, "Message not tracked, skipping status update");
                return;
            }

            const currentPriority = STATUS_PRIORITY[existing.status as MessageStatus] ?? -1;
            const newPriority = STATUS_PRIORITY[newStatus] ?? -1;

            // Only update if moving forward
            if (newPriority <= currentPriority) {
                log.debug(
                    { messageId, current: existing.status, attempted: newStatus },
                    "Status update skipped (not a forward transition)"
                );
                return;
            }

            await db
                .update(sentMessages)
                .set({
                    status: newStatus,
                    statusUpdatedAt: new Date(),
                })
                .where(eq(sentMessages.id, messageId));

            log.info({ messageId, from: existing.status, to: newStatus }, "Message status updated");
        } catch (err) {
            log.error({ err, messageId, newStatus }, "Failed to update message status");
        }
    }

    /**
     * Get message status by ID
     */
    async getStatus(messageId: string): Promise<SentMessage | null> {
        const [result] = await db
            .select()
            .from(sentMessages)
            .where(eq(sentMessages.id, messageId))
            .limit(1);
        return result ?? null;
    }
}

export const messageStatusService = new MessageStatusService();
