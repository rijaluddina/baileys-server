import type { Context, Next } from "hono";
import { ZodError } from "zod";
import { errorResponse, ErrorCodes } from "./types";
import { logger } from "@infrastructure/logger";
import { AppError } from "@infrastructure/errors";

const log = logger.child({ component: "error-handler" });

/**
 * Enhanced error handler
 * - No stack traces in production
 * - Sanitized error messages
 * - AppError support
 */
export async function errorHandler(err: Error, c: Context): Promise<Response> {
    // AppError (our custom errors)
    if (err instanceof AppError) {
        log.warn(
            { code: err.code, message: err.message, isTransient: err.isTransient },
            "Application error"
        );

        return c.json(errorResponse(err.code, err.message), err.statusCode as 400 | 401 | 403 | 404 | 429 | 500 | 503);
    }

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

    // Known error patterns (backwards compatibility)
    if (err.message.includes("not connected")) {
        return c.json(
            errorResponse(ErrorCodes.SESSION_NOT_CONNECTED, "Session not connected"),
            400
        );
    }

    if (err.message.includes("not found") || err.message.includes("Not found")) {
        return c.json(errorResponse(ErrorCodes.NOT_FOUND, "Resource not found"), 404);
    }

    // Unknown errors - sanitized response
    // Log full error internally, but don't expose to client
    log.error(
        {
            err: {
                name: err.name,
                message: err.message,
                // Only log stack in development
                stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
            },
        },
        "Unhandled error"
    );

    // Never expose internal details to client
    return c.json(
        errorResponse(ErrorCodes.INTERNAL_ERROR, "An unexpected error occurred"),
        500
    );
}

export async function requestLogger(c: Context, next: Next): Promise<void | Response> {
    const start = Date.now();
    const requestId = c.get("requestId");

    await next();

    const duration = Date.now() - start;
    log.info(
        {
            method: c.req.method,
            path: c.req.path,
            status: c.res.status,
            duration,
            requestId,
        },
        "Request completed"
    );
}

