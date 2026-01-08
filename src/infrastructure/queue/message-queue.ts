import { Job } from "bullmq";
import { RedisQueue, type QueueStats } from "./redis-queue";
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
async function handleOutgoingMessage(job: Job<OutgoingMessageJob>): Promise<{ messageId: string }> {
    const { sessionId, to, type, content } = job.data;

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
const incomingHandlers: ((job: Job<IncomingMessageJob>) => Promise<void>)[] = [];

async function handleIncomingMessage(job: Job<IncomingMessageJob>): Promise<void> {
    for (const handler of incomingHandlers) {
        await handler(job);
    }
}

// Create queue instances
export const outgoingQueue = new RedisQueue<OutgoingMessageJob>("outgoing-messages", {
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
    },
});

export const incomingQueue = new RedisQueue<IncomingMessageJob>("incoming-messages", {
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
    },
});

/**
 * Register a handler for incoming messages
 */
export function registerIncomingHandler(
    handler: (job: Job<IncomingMessageJob>) => Promise<void>
): void {
    incomingHandlers.push(handler);
}

/**
 * Queue an outgoing message
 */
export async function queueOutgoingMessage(
    data: OutgoingMessageJob,
    options: { priority?: 1 | 2 | 3 | 4; delay?: number } = {}
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
export async function getQueueStats(): Promise<{
    outgoing: QueueStats;
    incoming: QueueStats;
}> {
    const [outgoing, incoming] = await Promise.all([
        outgoingQueue.getStats(),
        incomingQueue.getStats(),
    ]);
    return { outgoing, incoming };
}

/**
 * Start all queue workers
 */
export function startQueues(): void {
    outgoingQueue.startWorker(handleOutgoingMessage, { concurrency: 10 });
    incomingQueue.startWorker(handleIncomingMessage, { concurrency: 20 });
    log.info("Message queues started");
}

/**
 * Stop all queue workers
 */
export async function stopQueues(): Promise<void> {
    await outgoingQueue.close();
    await incomingQueue.close();
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
