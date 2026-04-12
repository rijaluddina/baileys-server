import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { userService } from "@core/auth";
import { successResponse, errorResponse, ErrorCodes } from "../types";
import { requirePermission } from "../auth.middleware";

export const userRoutes = new Hono();

// Create new user schema
const createUserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: z.string().min(6),
    globalRole: z.enum(["owner", "standard"]).default("standard"),
});

// Update user schema
const updateUserSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    globalRole: z.enum(["owner", "standard"]).optional(),
    password: z.string().min(6).optional(),
});

// Create new user (system:manage)
userRoutes.post(
    "/",
    requirePermission("system:manage"), // only owners should create users directly ignoring signup flow
    zValidator("json", createUserSchema),
    async (c) => {
        const { email, name, password, globalRole } = c.req.valid("json");

        try {
            const user = await userService.createUser(
                email,
                password,
                name,
                globalRole
            );

            return c.json(successResponse({ user }), 201);
        } catch (error: any) {
            if (error.message?.includes('UNIQUE constraint failed') || error.code === '23505') { 
                return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Email already exists"), 400);
            }
            throw error;
        }
    }
);

// List users (system:manage) - global list
userRoutes.get(
    "/",
    requirePermission("system:manage"),
    async (c) => {
        const usersList = await userService.listUsers();
        return c.json(successResponse({ users: usersList }));
    }
);

// Get single user (system:manage)
userRoutes.get(
    "/:id",
    requirePermission("system:manage"),
    async (c) => {
        const { id } = c.req.param();
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "User ID required"), 400);

        const user = await userService.getUserById(id);
        if (!user) return c.json(errorResponse(ErrorCodes.NOT_FOUND, "User not found"), 404);

        return c.json(successResponse({ user }));
    }
);

// Update user (system:manage)
userRoutes.patch(
    "/:id",
    requirePermission("system:manage"),
    zValidator("json", updateUserSchema),
    async (c) => {
        const { id } = c.req.param();
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "User ID required"), 400);

        const updates = c.req.valid("json");
        const user = await userService.updateUser(id, {
            name: updates.name,
            globalRole: updates.globalRole,
            passwordPlain: updates.password,
        });

        if (!user) return c.json(errorResponse(ErrorCodes.NOT_FOUND, "User update failed"), 404);

        return c.json(successResponse({ user }));
    }
);

// Delete user (system:manage)
userRoutes.delete(
    "/:id",
    requirePermission("system:manage"),
    async (c) => {
        const { id } = c.req.param();
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "User ID required"), 400);

        const success = await userService.deleteUser(id);
        
        return c.json(successResponse({ success }));
    }
);
