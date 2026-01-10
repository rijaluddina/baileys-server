import type { Context, Next } from "hono";
import { errorResponse, ErrorCodes } from "./types";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "rate-limiter" });

interface RateLimitEntry {
    count: number;
    resetAt: number;
    burstCount: number;
    lastBurstReset: number;
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
}, 60000);

/**
 * Rate limit configuration
 * CRITICAL: MCP rate limiting is STRICTER than REST
 */
export interface RateLimitConfig {
    windowMs: number;
    limit: number;
    burstLimit: number;     // Max requests per second
    burstWindowMs: number;
}

export const RateLimits = {
    REST: {
        windowMs: 60000,        // 1 minute
        limit: 100,
        burstLimit: 10,         // 10 req/sec max
        burstWindowMs: 1000,
    },
    MCP: {
        windowMs: 60000,        // 1 minute
        limit: 30,              // STRICTER than REST
        burstLimit: 5,          // 5 req/sec max
        burstWindowMs: 1000,
    },
} as const;

/**
 * Rate limiting middleware
 */
export function rateLimiter(options: {
    windowMs?: number;
    defaultLimit?: number;
    config?: RateLimitConfig;
} = {}) {
    const config = options.config ?? RateLimits.REST;
    const windowMs = options.windowMs ?? config.windowMs;
    const defaultLimit = options.defaultLimit ?? config.limit;

    return async (c: Context, next: Next): Promise<Response | void> => {
        const keyInfo = c.get("apiKey");

        // Use API key ID or IP as identifier
        const identifier = keyInfo?.id ?? c.req.header("x-forwarded-for") ?? "anonymous";
        const limit = keyInfo?.rateLimit ?? defaultLimit;

        const now = Date.now();
        let entry = rateLimitStore.get(identifier);

        if (!entry || entry.resetAt < now) {
            entry = {
                count: 0,
                resetAt: now + windowMs,
                burstCount: 0,
                lastBurstReset: now,
            };
            rateLimitStore.set(identifier, entry);
        }

        // Reset burst counter if window passed
        if (now - entry.lastBurstReset >= config.burstWindowMs) {
            entry.burstCount = 0;
            entry.lastBurstReset = now;
        }

        entry.count++;
        entry.burstCount++;

        // Set comprehensive rate limit headers
        c.header("X-RateLimit-Limit", String(limit));
        c.header("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
        c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
        c.header("X-RateLimit-Burst-Limit", String(config.burstLimit));
        c.header("X-RateLimit-Burst-Remaining", String(Math.max(0, config.burstLimit - entry.burstCount)));

        // Check burst limit first
        if (entry.burstCount > config.burstLimit) {
            log.warn(
                { identifier, burstCount: entry.burstCount, burstLimit: config.burstLimit },
                "Burst limit exceeded"
            );

            c.header("Retry-After", "1");
            return c.json(
                errorResponse(ErrorCodes.RATE_LIMITED, "Too many requests. Slow down."),
                429
            );
        }

        // Check window limit
        if (entry.count > limit) {
            log.warn({ identifier, count: entry.count, limit }, "Rate limit exceeded");

            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            c.header("Retry-After", String(retryAfter));

            return c.json(
                errorResponse(ErrorCodes.RATE_LIMITED, "Rate limit exceeded. Please try again later."),
                429
            );
        }

        return next();
    };
}

/**
 * MCP-specific rate limiter (stricter)
 */
export function mcpRateLimiter() {
    return rateLimiter({ config: RateLimits.MCP });
}

