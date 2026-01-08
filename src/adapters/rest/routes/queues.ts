import { Hono } from "hono";
import { getQueueStats, outgoingQueue, incomingQueue } from "@infrastructure/queue";
import { successResponse } from "../types";

export const queueRoutes = new Hono();

// Get queue stats
queueRoutes.get("/stats", async (c) => {
    const stats = await getQueueStats();

    return c.json(
        successResponse({
            queues: {
                outgoing: stats.outgoing,
                incoming: stats.incoming,
            },
            totals: {
                waiting: stats.outgoing.waiting + stats.incoming.waiting,
                active: stats.outgoing.active + stats.incoming.active,
                completed: stats.outgoing.completed + stats.incoming.completed,
                failed: stats.outgoing.failed + stats.incoming.failed,
                delayed: stats.outgoing.delayed + stats.incoming.delayed,
            },
        })
    );
});

// Get failed jobs
queueRoutes.get("/failed", async (c) => {
    const queue = c.req.query("queue") || "outgoing";

    const q = queue === "incoming" ? incomingQueue : outgoingQueue;
    const jobs = await q.getFailedJobs(0, 50);

    return c.json(
        successResponse({
            queue,
            jobs: jobs.map((j) => ({
                id: j.id,
                name: j.name,
                data: j.data,
                failedReason: j.failedReason,
                attemptsMade: j.attemptsMade,
                timestamp: j.timestamp,
            })),
        })
    );
});

// Retry a failed job
queueRoutes.post("/failed/:queue/:id/retry", async (c) => {
    const { queue, id } = c.req.param();

    const q = queue === "incoming" ? incomingQueue : outgoingQueue;

    try {
        await q.retryJob(id);
        return c.json(successResponse({ success: true, jobId: id }));
    } catch (err: any) {
        return c.json(
            successResponse({ success: false, message: err.message }),
            404
        );
    }
});

// Get job by ID
queueRoutes.get("/jobs/:queue/:id", async (c) => {
    const { queue, id } = c.req.param();

    const q = queue === "incoming" ? incomingQueue : outgoingQueue;
    const job = await q.getJob(id);

    if (!job) {
        return c.json(successResponse({ found: false }), 404);
    }

    return c.json(
        successResponse({
            id: job.id,
            name: job.name,
            data: job.data,
            state: await job.getState(),
            attemptsMade: job.attemptsMade,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
        })
    );
});
