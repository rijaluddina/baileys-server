import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sign } from "hono/jwt";
import { userService } from "@core/auth";
import { successResponse, errorResponse, ErrorCodes } from "../types";

export const authRoutes = new Hono();

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

const signupSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");

    const user = await userService.verifyPassword(email, password);
    if (!user) {
        return c.json(errorResponse(ErrorCodes.UNAUTHORIZED, "Invalid email or password"), 401);
    }

    const secret = process.env.JWT_SECRET || "default_jwt_secret_change_me_in_production";
    
    // Create JWT
    const payload = {
        sub: user.id,
        globalRole: user.globalRole,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days expiration
    };

    const token = await sign(payload, secret, "HS256");

    return c.json(
        successResponse({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                globalRole: user.globalRole,
            },
        })
    );
});

authRoutes.post("/signup", zValidator("json", signupSchema), async (c) => {
    const { email, name, password } = c.req.valid("json");

    // Check if user already exists
    const existing = await userService.verifyPassword(email, "none"); // hacky check, better to add getUserByEmail
    // Let's rely on DB unique constraint handling if possible, or just add a check
    // Actually we don't have getUserByEmail exported in userService yet, 
    // let's just try to create and catch error.

    try {
        const count = await userService.getUserCount();
        const globalRole = count === 0 ? "owner" : "standard";

        const user = await userService.createUser(email, password, name, globalRole);

        const secret = process.env.JWT_SECRET || "default_jwt_secret_change_me_in_production";
        
        // Create JWT
        const payload = {
            sub: user.id,
            globalRole: user.globalRole,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days expiration
        };

        const token = await sign(payload, secret, "HS256");

        return c.json(
            successResponse({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    globalRole: user.globalRole,
                },
            }),
            201
        );
    } catch (e: any) {
        if (e.message && e.message.includes("UNIQUE constraint failed")) {
            return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, "Email already in use"), 400);
        }
        throw e; // rethrow for generic error handler
    }
});
