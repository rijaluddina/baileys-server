import { MemoryQueue, type QueueJob, type QueueStats } from "./memory-queue";
import { sessionManager } from "@core/session/session.manager";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "message-queue" });

// Outgoing message job data
export interface OutgoingMessageJob {
    sessionId: string;
    to: string;
    type: "text" | "media";
    content: {
        text?: string;
        mediaType?: "image" | "video" | "audio" | "document";
        mediaBuffer?: string; // Base64
        caption?: string;
        filename?: string;
        mimetype?: string;
    };
    quotedMessageId?: string;
}

// Incoming message job data
export interface IncomingMessageJob {
    sessionId: string;
    messageId: string;
    from: string;
    type: string;
    content: unknown;
    timestamp: number;
}

/**
 * Handler for outgoing messages
 */
async function handleOutgoingMessage(job: QueueJob<OutgoingMessageJob>): Promise<{ messageId: string }> {
    const { sessionId, to, type, content, quotedMessageId } = job.data;

    const session = await sessionManager.getSession(sessionId);
    if (!session) {
        throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.isConnected()) {
        throw new Error(`Session ${sessionId} not connected`);
    }

    if (type === "text" && content.text) {
        const result = await session.messaging.sendText(to, content.text);
        return { messageId: result.messageId };
    }

    if (type === "media" && content.mediaType && content.mediaBuffer) {
        const buffer = Buffer.from(content.mediaBuffer, "base64");
        const result = await session.messaging.sendMedia(to, content.mediaType, buffer, {
            caption: content.caption,
            filename: content.filename,
            mimetype: content.mimetype,
        });
        return { messageId: result.messageId };
    }

    throw new Error("Invalid message type or missing content");
}

/**
 * Handler for incoming messages (extensible pipeline)
 */
const incomingHandlers: ((job: QueueJob<IncomingMessageJob>) => Promise<void>)[] = [];

async function handleIncomingMessage(job: QueueJob<IncomingMessageJob>): Promise<void> {
    for (const handler of incomingHandlers) {
        await handler(job);
    }
}

// Create queue instances
export const outgoingQueue = new MemoryQueue<OutgoingMessageJob>(
    "outgoing-messages",
    handleOutgoingMessage,
    {
        maxAttempts: 3,
        retryDelayMs: 2000,
        concurrency: 10,
    }
);

export const incomingQueue = new MemoryQueue<IncomingMessageJob>(
    "incoming-messages",
    handleIncomingMessage,
    {
        maxAttempts: 3,
        retryDelayMs: 1000,
        concurrency: 20,
    }
);

/**
 * Register a handler for incoming messages
 */
export function registerIncomingHandler(
    handler: (job: QueueJob<IncomingMessageJob>) => Promise<void>
): void {
    incomingHandlers.push(handler);
}

/**
 * Queue an outgoing message
 */
export async function queueOutgoingMessage(
    data: OutgoingMessageJob,
    options: { priority?: "low" | "normal" | "high" | "critical" } = {}
): Promise<string> {
    return outgoingQueue.add("send", data, options);
}

/**
 * Queue an incoming message for processing
 */
export async function queueIncomingMessage(data: IncomingMessageJob): Promise<string> {
    return incomingQueue.add("process", data);
}

/**
 * Get combined queue stats
 */
export function getQueueStats(): {
    outgoing: QueueStats;
    incoming: QueueStats;
} {
    return {
        outgoing: outgoingQueue.getStats(),
        incoming: incomingQueue.getStats(),
    };
}

/**
 * Start all queue workers
 */
export function startQueues(): void {
    outgoingQueue.start();
    incomingQueue.start();
    log.info("Message queues started");
}

/**
 * Stop all queue workers
 */
export function stopQueues(): void {
    outgoingQueue.stop();
    incomingQueue.stop();
    log.info("Message queues stopped");
}

// Set up event listener to queue incoming messages
eventBus.on("message.received", async (data) => {
    await queueIncomingMessage({
        sessionId: data.sessionId,
        messageId: data.message.key.id || "",
        from: data.message.key.remoteJid || "",
        type: data.type,
        content: data.message.message,
        timestamp: Number(data.message.messageTimestamp) * 1000,
    });
});
