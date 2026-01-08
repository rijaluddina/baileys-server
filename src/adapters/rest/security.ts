import type { Context, Next } from "hono";

/**
 * Security headers middleware
 */
export async function securityHeaders(c: Context, next: Next): Promise<void | Response> {
    // Prevent clickjacking
    c.header("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    c.header("X-Content-Type-Options", "nosniff");

    // Enable XSS filter
    c.header("X-XSS-Protection", "1; mode=block");

    // Referrer policy
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");

    // Content Security Policy
    c.header(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'"
    );

    return next();
}

/**
 * CORS middleware configuration
 */
export function corsConfig() {
    return {
        origin: process.env.CORS_ORIGIN ?? "*",
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
        exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
        maxAge: 86400, // 24 hours
        credentials: true,
    };
}
