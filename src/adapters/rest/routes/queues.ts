import { Hono } from "hono";
import { getQueueStats, outgoingQueue, incomingQueue } from "@infrastructure/queue";
import { successResponse } from "../types";

export const queueRoutes = new Hono();

// Get queue stats
queueRoutes.get("/stats", (c) => {
    const stats = getQueueStats();

    return c.json(
        successResponse({
            queues: {
                outgoing: stats.outgoing,
                incoming: stats.incoming,
            },
            totals: {
                pending: stats.outgoing.pending + stats.incoming.pending,
                processing: stats.outgoing.processing + stats.incoming.processing,
                completed: stats.outgoing.completed + stats.incoming.completed,
                failed: stats.outgoing.failed + stats.incoming.failed,
                dead: stats.outgoing.dead + stats.incoming.dead,
            },
        })
    );
});

// Get dead letter queue
queueRoutes.get("/dead-letter", (c) => {
    const outgoingDead = outgoingQueue.getDeadLetterJobs();
    const incomingDead = incomingQueue.getDeadLetterJobs();

    return c.json(
        successResponse({
            outgoing: outgoingDead.map((j) => ({
                id: j.id,
                type: j.type,
                error: j.error,
                attempts: j.attempts,
                createdAt: j.createdAt,
            })),
            incoming: incomingDead.map((j) => ({
                id: j.id,
                type: j.type,
                error: j.error,
                attempts: j.attempts,
                createdAt: j.createdAt,
            })),
        })
    );
});

// Retry dead letter job
queueRoutes.post("/dead-letter/:queue/:id/retry", (c) => {
    const { queue, id } = c.req.param();

    let success = false;
    if (queue === "outgoing") {
        success = outgoingQueue.retryDeadLetter(id);
    } else if (queue === "incoming") {
        success = incomingQueue.retryDeadLetter(id);
    }

    if (!success) {
        return c.json(
            successResponse({ success: false, message: "Job not found in dead letter queue" }),
            404
        );
    }

    return c.json(successResponse({ success: true, jobId: id }));
});
