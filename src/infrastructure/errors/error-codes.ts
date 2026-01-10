/**
 * Stable Error Code Taxonomy
 * Used consistently across REST and MCP adapters
 */

export enum ErrorCode {
    // Core errors
    CORE_SESSION_DOWN = "CORE_SESSION_DOWN",
    CORE_SESSION_NOT_FOUND = "CORE_SESSION_NOT_FOUND",
    CORE_NOT_CONNECTED = "CORE_NOT_CONNECTED",

    // MCP errors
    MCP_TOOL_DENIED = "MCP_TOOL_DENIED",
    MCP_TOOL_NOT_FOUND = "MCP_TOOL_NOT_FOUND",

    // Rate limiting
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

    // Validation
    VALIDATION_ERROR = "VALIDATION_ERROR",
    INVALID_PARAMETER = "INVALID_PARAMETER",

    // Resilience
    CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN",
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",

    // Internal
    INTERNAL_TRANSIENT_ERROR = "INTERNAL_TRANSIENT_ERROR",
    INTERNAL_ERROR = "INTERNAL_ERROR",

    // Auth
    UNAUTHORIZED = "UNAUTHORIZED",
    FORBIDDEN = "FORBIDDEN",

    // Resource
    NOT_FOUND = "NOT_FOUND",
    CONFLICT = "CONFLICT",
}

/**
 * Application error with code
 */
export class AppError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly statusCode: number = 500,
        public readonly isTransient: boolean = false
    ) {
        super(message);
        this.name = "AppError";
    }

    toJSON() {
        return {
            code: this.code,
            message: this.message,
        };
    }
}

/**
 * Factory functions for common errors
 */
export const Errors = {
    sessionNotFound: (sessionId: string) =>
        new AppError(ErrorCode.CORE_SESSION_NOT_FOUND, `Session not found: ${sessionId}`, 404),

    sessionDown: (sessionId: string) =>
        new AppError(ErrorCode.CORE_SESSION_DOWN, `Session unavailable: ${sessionId}`, 503, true),

    notConnected: (sessionId: string) =>
        new AppError(ErrorCode.CORE_NOT_CONNECTED, `Session not connected: ${sessionId}`, 503),

    toolDenied: (tool: string) =>
        new AppError(ErrorCode.MCP_TOOL_DENIED, `Tool not permitted: ${tool}`, 403),

    rateLimitExceeded: () =>
        new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, "Rate limit exceeded", 429),

    validationError: (message: string) =>
        new AppError(ErrorCode.VALIDATION_ERROR, message, 400),

    circuitOpen: (service: string) =>
        new AppError(ErrorCode.CIRCUIT_BREAKER_OPEN, `Service unavailable: ${service}`, 503, true),

    transientError: (message: string) =>
        new AppError(ErrorCode.INTERNAL_TRANSIENT_ERROR, message, 500, true),

    internal: (message: string) =>
        new AppError(ErrorCode.INTERNAL_ERROR, message, 500),
};
