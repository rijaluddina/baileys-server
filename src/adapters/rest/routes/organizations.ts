import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { userService } from "@core/auth";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { requirePermission } from "../auth.middleware";

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

// Add member to organization
orgRoutes.post(
    "/:id/members",
    requirePermission("users:manage"), // Ideally scoped by the organization, for now relying on global/strong permission
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

// We could add endpoints to list organizations, remove members, etc.
