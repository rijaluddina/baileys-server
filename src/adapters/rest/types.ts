import { z } from "zod";

// Common response wrapper
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    meta?: {
        timestamp: string;
        requestId?: string;
    };
}

export function successResponse<T>(data: T, meta?: { requestId?: string }): ApiResponse<T> {
    return {
        success: true,
        data,
        meta: {
            timestamp: new Date().toISOString(),
            ...meta,
        },
    };
}

export function errorResponse(
    code: string,
    message: string,
    details?: unknown
): ApiResponse<never> {
    return {
        success: false,
        error: { code, message, details },
        meta: {
            timestamp: new Date().toISOString(),
        },
    };
}

// Error codes
export const ErrorCodes = {
    VALIDATION_ERROR: "VALIDATION_ERROR",
    NOT_FOUND: "NOT_FOUND",
    SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
    SESSION_NOT_CONNECTED: "SESSION_NOT_CONNECTED",
    SOCKET_ERROR: "SOCKET_ERROR",
    INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
