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
        organizationId: user.organizationId,
        role: user.role,
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
                role: user.role,
                organizationId: user.organizationId,
            },
        })
    );
});
