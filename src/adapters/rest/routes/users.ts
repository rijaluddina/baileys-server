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
    role: z.enum(["viewer", "operator", "admin", "owner"]).default("viewer"),
});

// Update user schema
const updateUserSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    role: z.enum(["viewer", "operator", "admin", "owner"]).optional(),
    password: z.string().min(6).optional(),
});

// Create new user (owner only)
userRoutes.post(
    "/",
    requirePermission("users:manage"),
    zValidator("json", createUserSchema),
    async (c) => {
        const { email, name, password, role } = c.req.valid("json");
        const auth = c.get("auth");

        if (!auth || !auth.organizationId) {
            return c.json(errorResponse(ErrorCodes.UNAUTHORIZED, "Organization ID not bound to your session"), 401);
        }

        try {
            const user = await userService.createUser(
                auth.organizationId,
                email,
                password,
                name,
                role
            );

            return c.json(successResponse({ user }), 201);
        } catch (error: any) {
            // Check for duplicate email
            if (error.code === '23505') { 
                return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Email already exists"), 400);
            }
            throw error;
        }
    }
);

// List users (owner only)
userRoutes.get(
    "/",
    requirePermission("users:manage"),
    async (c) => {
        const auth = c.get("auth");
        const usersList = await userService.listUsers(auth?.organizationId ?? undefined);

        return c.json(successResponse({ users: usersList }));
    }
);

// Get single user (owner only)
userRoutes.get(
    "/:id",
    requirePermission("users:manage"),
    async (c) => {
        const { id } = c.req.param();
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "User ID required"), 400);

        const user = await userService.getUserById(id);
        if (!user) return c.json(errorResponse(ErrorCodes.NOT_FOUND, "User not found"), 404);

        // Ensure user belongs to same org
        const auth = c.get("auth");
        if (user.organizationId !== auth?.organizationId) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "User not found"), 404);
        }

        return c.json(successResponse({ user }));
    }
);

// Update user (owner only)
userRoutes.patch(
    "/:id",
    requirePermission("users:manage"),
    zValidator("json", updateUserSchema),
    async (c) => {
        const { id } = c.req.param();
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "User ID required"), 400);

        // Optional verify same org
        const existingUser = await userService.getUserById(id);
        const auth = c.get("auth");
        if (!existingUser || existingUser.organizationId !== auth?.organizationId) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "User not found"), 404);
        }

        const updates = c.req.valid("json");
        const user = await userService.updateUser(id, {
            name: updates.name,
            role: updates.role,
            passwordPlain: updates.password,
        });

        if (!user) return c.json(errorResponse(ErrorCodes.NOT_FOUND, "User update failed"), 404);

        return c.json(successResponse({ user }));
    }
);

// Delete user (owner only)
userRoutes.delete(
    "/:id",
    requirePermission("users:manage"),
    async (c) => {
        const { id } = c.req.param();
        if (!id) return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "User ID required"), 400);

        const existingUser = await userService.getUserById(id);
        const auth = c.get("auth");
        if (!existingUser || existingUser.organizationId !== auth?.organizationId) {
            return c.json(errorResponse(ErrorCodes.NOT_FOUND, "User not found"), 404);
        }

        const success = await userService.deleteUser(id);
        
        return c.json(successResponse({ success }));
    }
);
