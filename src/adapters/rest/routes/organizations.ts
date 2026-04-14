import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { userService } from "@core/auth";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { requirePermission } from "../auth.middleware";
import { db } from "@infrastructure/database";
import { organizations, organizationMembers, users } from "@infrastructure/database/schema";
import { eq, and } from "drizzle-orm";

export const orgRoutes = new Hono();

// Create Org Schema
const createOrgSchema = z.object({
    name: z.string().min(1).max(100),
});

// Assign Member Schema
const assignMemberSchema = z.object({
    userId: z.string().uuid(),
    role: z.enum(["viewer", "operator", "admin", "owner"]).default("viewer"),
});

// List organizations for the authenticated user
orgRoutes.get(
    "/",
    requirePermission("data:read"),
    async (c) => {
        const auth = c.get("auth");

        if (!auth?.userId) {
            return c.json(errorResponse(ErrorCodes.UNAUTHORIZED, "User context required"), 401);
        }

        const memberships = await db
            .select({
                id: organizations.id,
                name: organizations.name,
                role: organizationMembers.role,
                createdAt: organizations.createdAt,
            })
            .from(organizationMembers)
            .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
            .where(eq(organizationMembers.userId, auth.userId));

        return c.json(successResponse({
            organizations: memberships.map((m) => ({
                id: m.id,
                name: m.name,
                role: m.role,
                createdAt: m.createdAt,
            })),
        }));
    }
);

// Owner only - Creating organizations
orgRoutes.post(
    "/",
    requirePermission("system:manage"),
    zValidator("json", createOrgSchema),
    async (c) => {
        const { name } = c.req.valid("json");
        const auth = c.get("auth");

        const org = await userService.createOrganization(name, auth?.userId as string);
        return c.json(successResponse({ organization: org }), 201);
    }
);

// Get organization details
orgRoutes.get(
    "/:id",
    requirePermission("data:read"),
    async (c) => {
        const orgId = c.req.param("id");
        const auth = c.get("auth");

        const org = await userService.getOrganization(orgId);
        if (!org) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Organization not found"), 404);
        }

        // Verify user has access to this org (unless owner global role)
        if (auth?.globalRole !== "owner" && auth?.userId) {
            const members = await db
                .select({ userId: organizationMembers.userId })
                .from(organizationMembers)
                .where(
                    and(
                        eq(organizationMembers.organizationId, orgId),
                        eq(organizationMembers.userId, auth.userId)
                    )
                )
                .limit(1);

            if (members.length === 0) {
                return c.json(errorResponse(ErrorCodes.FORBIDDEN, "No access to this organization"), 403);
            }
        }

        return c.json(successResponse({ organization: org }));
    }
);

// List members of an organization
orgRoutes.get(
    "/:id/members",
    requirePermission("data:read"),
    async (c) => {
        const orgId = c.req.param("id");
        const auth = c.get("auth");

        // Verify org exists
        const org = await userService.getOrganization(orgId);
        if (!org) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Organization not found"), 404);
        }

        // Verify access (unless global owner)
        if (auth?.globalRole !== "owner" && auth?.userId) {
            const membership = await db
                .select({ userId: organizationMembers.userId })
                .from(organizationMembers)
                .where(
                    and(
                        eq(organizationMembers.organizationId, orgId),
                        eq(organizationMembers.userId, auth.userId)
                    )
                )
                .limit(1);

            if (membership.length === 0) {
                return c.json(errorResponse(ErrorCodes.FORBIDDEN, "No access to this organization"), 403);
            }
        }

        const members = await db
            .select({
                id: organizationMembers.id,
                userId: organizationMembers.userId,
                role: organizationMembers.role,
                userName: users.name,
                userEmail: users.email,
                joinedAt: organizationMembers.createdAt,
            })
            .from(organizationMembers)
            .innerJoin(users, eq(organizationMembers.userId, users.id))
            .where(eq(organizationMembers.organizationId, orgId));

        return c.json(successResponse({
            organizationId: orgId,
            members: members.map((m) => ({
                id: m.id,
                userId: m.userId,
                name: m.userName,
                email: m.userEmail,
                role: m.role,
                joinedAt: m.joinedAt,
            })),
        }));
    }
);

// Add member to organization
orgRoutes.post(
    "/:id/members",
    requirePermission("users:manage"),
    zValidator("json", assignMemberSchema),
    async (c) => {
        const orgId = c.req.param("id");
        const { userId, role } = c.req.valid("json");

        try {
            const memberInfo = await userService.assignUserToOrganization(userId, orgId, role);
            return c.json(successResponse({ member: memberInfo }));
        } catch (e: any) {
             return c.json(errorResponse(ErrorCodes.INTERNAL_ERROR, "Failed to assign member"), 500);
        }
    }
);

// Remove member from organization
orgRoutes.delete(
    "/:id/members/:userId",
    requirePermission("users:manage"),
    async (c) => {
        const orgId = c.req.param("id");
        const userId = c.req.param("userId");

        // Prevent removing the last owner
        const orgMembers = await db
            .select({ userId: organizationMembers.userId, role: organizationMembers.role })
            .from(organizationMembers)
            .where(eq(organizationMembers.organizationId, orgId));

        const targetMember = orgMembers.find((m) => m.userId === userId);
        if (!targetMember) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Member not found in organization"), 404);
        }

        // Prevent removing the last owner of the org
        if (targetMember.role === "owner") {
            const ownerCount = orgMembers.filter((m) => m.role === "owner").length;
            if (ownerCount <= 1) {
                return c.json(
                    errorResponse(ErrorCodes.VALIDATION_ERROR, "Cannot remove the last owner of an organization"),
                    400
                );
            }
        }

        const [deleted] = await db
            .delete(organizationMembers)
            .where(
                and(
                    eq(organizationMembers.organizationId, orgId),
                    eq(organizationMembers.userId, userId)
                )
            )
            .returning({ id: organizationMembers.id });

        if (!deleted) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Member not found"), 404);
        }

        return c.json(successResponse({
            organizationId: orgId,
            userId,
            removed: true,
        }));
    }
);

