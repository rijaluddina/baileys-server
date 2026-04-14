import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { authService, permissionService, type ApiKeyInfo, type Role } from "@core/auth";
import { errorResponse, ErrorCodes } from "./types";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "auth-middleware" });
let devModeWarned = false;

export interface AuthContext {
    type: "api-key" | "user";
    id: string; // apiKey.id or user.id
    keyId: string | null; // null if type is "user"
    organizationId: string | null; // only applies strictly for api-keys scoped to org
    userId: string | null; // same as id if "user"
    globalRole?: "owner" | "standard"; // users only
    role?: Role; // api-keys or specific org context
    sessionIds: string[]; // for API keys
    rateLimit: number;
    isAuthenticated: boolean;
    permissions: string[];
}

// Extend Hono context with auth info
declare module "hono" {
    interface ContextVariableMap {
        auth?: AuthContext;
        // Keep apiKey for backward compatibility temporarily
        apiKey?: ApiKeyInfo;
    }
}

/**
 * Combined authentication middleware (API Key or JWT)
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
    const apiKeyHeader = c.req.header("X-API-Key");
    const authHeader = c.req.header("Authorization");

    // Allow unauthenticated access in development only
    if (process.env.NODE_ENV === "development" && !apiKeyHeader && !authHeader) {
        if (!devModeWarned) {
            log.warn("⚠️  AUTH BYPASSED: Running in development mode without authentication. NEVER use NODE_ENV=development in production!");
            devModeWarned = true;
        }
        log.debug("Skipping auth in development mode");
        return next();
    }

    // Safety check: Ensure NODE_ENV is set in production environments
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
        if (!apiKeyHeader && !authHeader) {
            return c.json(
                errorResponse("UNAUTHORIZED", "Authentication required. Use X-API-Key or Authorization Bearer token."),
                401
            );
        }
    }

    if (!apiKeyHeader && !authHeader) {
        return c.json(
            errorResponse("UNAUTHORIZED", "Authentication required. Use X-API-Key or Authorization Bearer token."),
            401
        );
    }

    let authContext: AuthContext;

    // JWT Auth
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        if (!token) {
            return c.json(errorResponse("UNAUTHORIZED", "Bearer token missing"), 401);
        }

        try {
            const secret = process.env.JWT_SECRET || "default_jwt_secret_change_me_in_production";
            const payload = await verify(token, secret, "HS256");

            const globalRole = payload.globalRole as "owner" | "standard";
            const userId = payload.sub as string;

            // Resolve org-level permissions when X-Organization-Id header is present
            let resolvedOrgId: string | null = null;
            let permissions: string[] = [];
            let resolvedRole: Role | undefined;

            const orgIdHeader = c.req.header("X-Organization-Id");

            if (globalRole === "owner") {
                // Owners have all permissions globally
                permissions = permissionService.getPermissions("owner");
                resolvedOrgId = orgIdHeader ?? null;
                resolvedRole = "owner";
            } else if (orgIdHeader) {
                // Standard users: resolve permissions from org membership
                const orgRole = await permissionService.getUserRoleForOrganization(userId, orgIdHeader);
                if (orgRole) {
                    permissions = permissionService.getPermissions(orgRole);
                    resolvedOrgId = orgIdHeader;
                    resolvedRole = orgRole;
                } else {
                    log.warn({ userId, organizationId: orgIdHeader }, "User has no role in requested organization");
                    // Allow request but with no permissions — guards will reject if needed
                }
            }

            authContext = {
                type: "user",
                id: userId,
                keyId: null,
                organizationId: resolvedOrgId,
                userId: userId,
                globalRole: globalRole,
                role: resolvedRole,
                sessionIds: [], 
                rateLimit: 1000, 
                isAuthenticated: true,
                permissions,
            };
            log.debug({ userId: authContext.id, globalRole, organizationId: resolvedOrgId, role: resolvedRole }, "JWT Authenticated request");
        } catch (err) {
            log.warn("Invalid JWT token");
            return c.json(errorResponse("UNAUTHORIZED", "Invalid or expired JWT token"), 401);
        }
    } 
    // API Key Auth
    else if (apiKeyHeader) {
        const keyInfo = await authService.validateKey(apiKeyHeader);
        if (!keyInfo) {
            log.warn({ keyPrefix: apiKeyHeader.slice(0, 12) }, "Invalid API key");
            return c.json(errorResponse("UNAUTHORIZED", "Invalid or expired API key"), 401);
        }

        authContext = {
            type: "api-key",
            id: keyInfo.id,
            keyId: keyInfo.id,
            organizationId: keyInfo.organizationId,
            userId: keyInfo.userId,
            role: keyInfo.role,
            sessionIds: keyInfo.sessionIds,
            rateLimit: keyInfo.rateLimit,
            isAuthenticated: true,
            permissions: permissionService.getPermissions(keyInfo.role),
        };
        // Backwards compatibility
        c.set("apiKey", keyInfo);
        log.debug({ keyId: keyInfo.id, role: keyInfo.role }, "API Key Authenticated request");
    } else {
        // This case should ideally be covered by the initial check, but added for type safety
        return c.json(errorResponse("UNAUTHORIZED", "Authentication required"), 401);
    }
    // Store auth info in context
    c.set("auth", authContext);

    return next();
}

/**
 * Permission check middleware factory
 */
export function requirePermission(permission: string) {
    return async (c: Context, next: Next): Promise<Response | void> => {
        const auth = c.get("auth");

        // Skip in development without auth
        if (!auth && process.env.NODE_ENV === "development") {
            return next();
        }

        if (!auth) {
            return c.json(errorResponse("UNAUTHORIZED", "Authentication required"), 401);
        }

        if (!auth.permissions.includes(permission)) {
            log.warn(
                { id: auth.id, role: auth.role, globalRole: auth.globalRole, permission, type: auth.type },
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
 * Ensures the API Key has access to this sessionId specifically (if scoping is used).
 * NOTE: DB queries still need to filter by organizationId to ensure true isolation!
 */
export function requireSessionAccess(getSessionId: (c: Context) => string | undefined) {
    return async (c: Context, next: Next): Promise<Response | void> => {
        const auth = c.get("auth");
        const sessionId = getSessionId(c);

        // Skip in development without auth
        if (!auth && process.env.NODE_ENV === "development") {
            return next();
        }

        if (!auth) {
            return c.json(errorResponse("UNAUTHORIZED", "Authentication required"), 401);
        }

        if (sessionId && auth.type === "api-key") {
            const keyInfo = c.get("apiKey")!;
            if (!authService.canAccessSession(keyInfo, sessionId)) {
                log.warn(
                    { keyId: keyInfo.id, sessionId },
                    "Session access denied"
                );
                return c.json(
                    errorResponse("FORBIDDEN", "No access to this session"),
                    403
                );
            }
        }

        return next();
    };
}
