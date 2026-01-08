import type { Context, Next } from "hono";
import { httpRequestsTotal, httpRequestDuration } from "@infrastructure/metrics";

/**
 * Metrics collection middleware
 */
export async function metricsMiddleware(c: Context, next: Next): Promise<void | Response> {
    const start = performance.now();
    const method = c.req.method;
    const path = normalizePath(c.req.path);

    await next();

    const duration = (performance.now() - start) / 1000;
    const status = c.res.status.toString();

    // Record metrics
    httpRequestsTotal.inc({ method, path, status });
    httpRequestDuration.observe({ method, path }, duration);
}

/**
 * Normalize path for metrics (remove IDs to avoid cardinality explosion)
 */
function normalizePath(path: string): string {
    return path
        // Replace UUIDs
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
        // Replace numeric IDs
        .replace(/\/\d+/g, "/:id")
        // Replace phone numbers (WhatsApp JIDs)
        .replace(/\d+@[a-z.]+/g, ":jid");
}
