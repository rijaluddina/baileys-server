import type { Context, Next } from "hono";
import { ZodError } from "zod";
import { errorResponse, ErrorCodes } from "./types";
import { logger } from "@infrastructure/logger";

export async function errorHandler(err: Error, c: Context): Promise<Response> {
    const log = logger.child({ component: "error-handler" });

    // Zod validation errors
    if (err instanceof ZodError) {
        return c.json(
            errorResponse(
                ErrorCodes.VALIDATION_ERROR,
                "Validation failed",
                err.errors.map((e) => ({
                    path: e.path.join("."),
                    message: e.message,
                }))
            ),
            400
        );
    }

    // Known error types
    if (err.message.includes("not connected")) {
        return c.json(
            errorResponse(ErrorCodes.SESSION_NOT_CONNECTED, err.message),
            400
        );
    }

    if (err.message.includes("not found") || err.message.includes("Not found")) {
        return c.json(errorResponse(ErrorCodes.NOT_FOUND, err.message), 404);
    }

    // Unknown errors
    log.error({ err }, "Unhandled error");
    return c.json(
        errorResponse(ErrorCodes.INTERNAL_ERROR, "Internal server error"),
        500
    );
}

export async function requestLogger(c: Context, next: Next): Promise<void | Response> {
    const start = Date.now();
    const log = logger.child({ component: "http" });

    await next();

    const duration = Date.now() - start;
    log.info(
        {
            method: c.req.method,
            path: c.req.path,
            status: c.res.status,
            duration,
        },
        "Request completed"
    );
}
