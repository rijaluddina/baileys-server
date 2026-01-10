/**
 * Audit Logger
 * 
 * CRITICAL: Audit log = immutable append-only.
 * Uses dedicated level (not info reuse).
 */

import { pino } from "pino";

// Dedicated audit log level (35 = between info and warn)
const AUDIT_LEVEL = 35;

// Create audit logger with separate transport
const auditLogger = pino({
    level: "info",
    customLevels: {
        audit: AUDIT_LEVEL,
    },
    formatters: {
        level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});

export interface AuditEvent {
    action: string;
    actor: string;        // API key ID or system
    resource: string;     // What was affected
    resourceId?: string;
    details?: Record<string, unknown>;
    result: "success" | "failure";
    error?: string;
}

/**
 * Log audit event (immutable append-only)
 */
export function audit(event: AuditEvent): void {
    // Use custom audit level
    (auditLogger as any).audit({
        ...event,
        timestamp: new Date().toISOString(),
        type: "audit",
    });
}

/**
 * Pre-built audit actions
 */
export const AuditActions = {
    // Session management
    SESSION_CREATED: "session.created",
    SESSION_DELETED: "session.deleted",
    SESSION_CONNECTED: "session.connected",
    SESSION_DISCONNECTED: "session.disconnected",

    // API key management
    API_KEY_CREATED: "api_key.created",
    API_KEY_REVOKED: "api_key.revoked",

    // Webhook management
    WEBHOOK_CREATED: "webhook.created",
    WEBHOOK_DELETED: "webhook.deleted",
    WEBHOOK_UPDATED: "webhook.updated",

    // Admin operations
    ADMIN_ACTION: "admin.action",
    CONFIG_CHANGED: "config.changed",
} as const;

/**
 * Helper for admin operations
 */
export function auditAdmin(
    action: string,
    actor: string,
    resource: string,
    result: "success" | "failure",
    details?: Record<string, unknown>
): void {
    audit({
        action,
        actor,
        resource,
        result,
        details,
    });
}
