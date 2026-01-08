import type { Context, Next } from "hono";

/**
 * Request ID middleware - adds correlation ID to requests
 */
export async function requestIdMiddleware(c: Context, next: Next): Promise<void | Response> {
    const requestId = c.req.header("x-request-id") || crypto.randomUUID();

    // Set request ID in context
    c.set("requestId", requestId);

    // Add to response headers
    c.header("X-Request-Id", requestId);

    await next();
}

// Extend Hono context types
declare module "hono" {
    interface ContextVariableMap {
        requestId: string;
    }
}
