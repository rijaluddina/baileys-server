/**
 * MCP-side Rate Limiter (Double-Layer)
 *
 * This is the SECOND layer of rate limiting.
 * Layer 1: REST API rate limiter (per API Key)
 * Layer 2: This limiter (per MCP session, applied BEFORE HTTP call)
 *
 * Purpose: Prevent a rogue LLM agent from flooding the REST API
 * even before the request reaches the network.
 */

import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "mcp-rate-limiter" });

interface RateBucket {
    count: number;
    resetAt: number;
}

export interface McpRateLimitConfig {
    /** Max requests per window */
    limit: number;
    /** Window duration in ms */
    windowMs: number;
}

const DEFAULT_CONFIG: McpRateLimitConfig = {
    limit: Number(process.env.MCP_RATE_LIMIT) || 30,
    windowMs: 60_000, // 1 minute
};

export class McpRateLimiter {
    private bucket: RateBucket;
    private config: McpRateLimitConfig;

    constructor(config?: Partial<McpRateLimitConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.bucket = {
            count: 0,
            resetAt: Date.now() + this.config.windowMs,
        };

        log.info(
            { limit: this.config.limit, windowMs: this.config.windowMs },
            "MCP rate limiter initialized"
        );
    }

    /**
     * Check if the current request is allowed.
     * Returns { allowed: true } or { allowed: false, retryAfterMs }.
     */
    check(): { allowed: true } | { allowed: false; retryAfterMs: number } {
        const now = Date.now();

        // Reset bucket if window expired
        if (now >= this.bucket.resetAt) {
            this.bucket = {
                count: 0,
                resetAt: now + this.config.windowMs,
            };
        }

        this.bucket.count++;

        if (this.bucket.count > this.config.limit) {
            const retryAfterMs = this.bucket.resetAt - now;
            log.warn(
                { count: this.bucket.count, limit: this.config.limit, retryAfterMs },
                "MCP rate limit exceeded"
            );
            return { allowed: false, retryAfterMs };
        }

        return { allowed: true };
    }

    /**
     * Wrap a tool handler with rate limiting.
     * Returns MCP error result if rate limited.
     */
    guard<T>(
        handler: () => Promise<T>
    ): Promise<T | { [x: string]: unknown; content: Array<{ type: "text"; text: string }>; isError: true }> {
        const result = this.check();

        if (!result.allowed) {
            return Promise.resolve({
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        error: "Rate limit exceeded. Please slow down.",
                        code: "RATE_LIMITED",
                        retryAfterMs: result.retryAfterMs,
                    }),
                }],
                isError: true as const,
            });
        }

        return handler();
    }

    /** Get current usage stats (for debugging/monitoring) */
    getStats(): { count: number; limit: number; resetAt: number; remaining: number } {
        const now = Date.now();
        if (now >= this.bucket.resetAt) {
            return { count: 0, limit: this.config.limit, resetAt: now + this.config.windowMs, remaining: this.config.limit };
        }
        return {
            count: this.bucket.count,
            limit: this.config.limit,
            resetAt: this.bucket.resetAt,
            remaining: Math.max(0, this.config.limit - this.bucket.count),
        };
    }
}
