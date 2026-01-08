import type { Context, Next } from "hono";
import { authService, type ApiKeyInfo } from "@core/auth";
import { errorResponse, ErrorCodes } from "./types";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "auth-middleware" });

// Extend Hono context with auth info
declare module "hono" {
    interface ContextVariableMap {
        apiKey?: ApiKeyInfo;
    }
}

/**
 * API Key authentication middleware
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
    const apiKey = c.req.header("X-API-Key");

    // Allow unauthenticated access in development
    if (process.env.NODE_ENV === "development" && !apiKey) {
        log.debug("Skipping auth in development mode");
        return next();
    }

    if (!apiKey) {
        return c.json(
            errorResponse("UNAUTHORIZED", "API key required. Use X-API-Key header."),
            401
        );
    }

    const keyInfo = await authService.validateKey(apiKey);

    if (!keyInfo) {
        log.warn({ keyPrefix: apiKey.slice(0, 12) }, "Invalid API key");
        return c.json(errorResponse("UNAUTHORIZED", "Invalid or expired API key"), 401);
    }

    // Store key info in context
    c.set("apiKey", keyInfo);

    log.debug({ keyId: keyInfo.id, role: keyInfo.role }, "Authenticated request");

    return next();
}

/**
 * Permission check middleware factory
 */
export function requirePermission(permission: string) {
    return async (c: Context, next: Next): Promise<Response | void> => {
        const keyInfo = c.get("apiKey");

        // Skip in development without auth
        if (!keyInfo && process.env.NODE_ENV === "development") {
            return next();
        }

        if (!keyInfo) {
            return c.json(errorResponse("UNAUTHORIZED", "Authentication required"), 401);
        }

        if (!authService.hasPermission(keyInfo.role, permission)) {
            log.warn(
                { keyId: keyInfo.id, role: keyInfo.role, permission },
                "Permission denied"
            );
            return c.json(
                errorResponse("FORBIDDEN", `Permission '${permission}' required`),
                403
            );
        }

        return next();
    };
}

/**
 * Session access check middleware
 */
export function requireSessionAccess(getSessionId: (c: Context) => string | undefined) {
    return async (c: Context, next: Next): Promise<Response | void> => {
        const keyInfo = c.get("apiKey");
        const sessionId = getSessionId(c);

        // Skip in development without auth
        if (!keyInfo && process.env.NODE_ENV === "development") {
            return next();
        }

        if (!keyInfo) {
            return c.json(errorResponse("UNAUTHORIZED", "Authentication required"), 401);
        }

        if (sessionId && !authService.canAccessSession(keyInfo, sessionId)) {
            log.warn(
                { keyId: keyInfo.id, sessionId },
                "Session access denied"
            );
            return c.json(
                errorResponse("FORBIDDEN", "No access to this session"),
                403
            );
        }

        return next();
    };
}
