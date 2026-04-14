import { db } from "@infrastructure/database";
import { organizationMembers } from "@infrastructure/database/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@infrastructure/logger";

export type Role = "viewer" | "operator" | "admin" | "owner";

// Permission matrix
export const PERMISSIONS: Record<Role, Record<string, boolean>> = {
    viewer: {
        "data:read": true,
        "messages:read": true,
    },
    operator: {
        "sessions:control": true,
        "messages:send": true,
        "messages:read": true,
        "messages:write": true,
        "data:read": true,
    },
    admin: {
        "sessions:create": true,
        "sessions:delete": true,
        "sessions:control": true,
        "messages:send": true,
        "messages:read": true,
        "messages:write": true,
        "data:read": true,
        "webhooks:manage": true,
        "admin:read": true,
        "admin:write": true,
        "queues:read": true,
        "queues:write": true,
    },
    owner: {
        "users:manage": true,
        "system:manage": true,
        "sessions:create": true,
        "sessions:delete": true,
        "sessions:control": true,
        "messages:send": true,
        "messages:read": true,
        "messages:write": true,
        "data:read": true,
        "webhooks:manage": true,
        "admin:read": true,
        "admin:write": true,
        "queues:read": true,
        "queues:write": true,
    },
};

export class PermissionService {
    private readonly log = logger.child({ component: "permission-service" });

    /**
     * Check if a role has a specific permission
     */
    hasPermission(role: Role, permission: string): boolean {
        return PERMISSIONS[role]?.[permission] ?? false;
    }

    /**
     * Get all permissions for a role
     */
    getPermissions(role: Role): string[] {
        return Object.keys(PERMISSIONS[role] || {});
    }

    /**
     * Get the role of a user within a specific organization
     */
    async getUserRoleForOrganization(userId: string, organizationId: string): Promise<Role | null> {
        const [member] = await db
            .select({ role: organizationMembers.role })
            .from(organizationMembers)
            .where(
                and(
                    eq(organizationMembers.userId, userId),
                    eq(organizationMembers.organizationId, organizationId)
                )
            )
            .limit(1);

        if (!member) {
            return null;
        }

        return member.role as Role;
    }

    /**
     * Get all dynamic permissions for a user within a specific organization
     */
    async getUserPermissionsForOrganization(userId: string, organizationId: string): Promise<string[]> {
        const role = await this.getUserRoleForOrganization(userId, organizationId);
        if (!role) {
            return [];
        }

        return this.getPermissions(role);
    }
}

export const permissionService = new PermissionService();
