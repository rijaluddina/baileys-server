import pino from "pino";

// Use synchronous pretty printing for development (Bun-compatible)
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    ...(isDev && {
        transport: {
            target: "pino-pretty",
        },
    }),
});

export type Logger = typeof logger;
