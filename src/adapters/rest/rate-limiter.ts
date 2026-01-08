import type { Context, Next } from "hono";
import { errorResponse } from "./types";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "rate-limiter" });

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// In-memory store (use Redis for production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetAt < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Every minute

/**
 * Rate limiting middleware
 */
export function rateLimiter(options: {
    windowMs?: number;
    defaultLimit?: number;
} = {}) {
    const windowMs = options.windowMs ?? 60000; // 1 minute
    const defaultLimit = options.defaultLimit ?? 100;

    return async (c: Context, next: Next): Promise<Response | void> => {
        const keyInfo = c.get("apiKey");

        // Use API key ID or IP as identifier
        const identifier = keyInfo?.id ?? c.req.header("x-forwarded-for") ?? "anonymous";
        const limit = keyInfo?.rateLimit ?? defaultLimit;

        const now = Date.now();
        let entry = rateLimitStore.get(identifier);

        if (!entry || entry.resetAt < now) {
            entry = { count: 0, resetAt: now + windowMs };
            rateLimitStore.set(identifier, entry);
        }

        entry.count++;

        // Set rate limit headers
        c.header("X-RateLimit-Limit", String(limit));
        c.header("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
        c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

        if (entry.count > limit) {
            log.warn({ identifier, count: entry.count, limit }, "Rate limit exceeded");

            return c.json(
                errorResponse("RATE_LIMITED", "Too many requests. Please try again later."),
                429
            );
        }

        return next();
    };
}
