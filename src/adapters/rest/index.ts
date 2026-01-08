import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessionRoutes } from "./routes/sessions";
import { messageRoutes } from "./routes/messages";
import { contactRoutes } from "./routes/contacts";
import { groupRoutes } from "./routes/groups";
import { presenceRoutes } from "./routes/presence";
import { eventsRoutes } from "./routes/events";
import { healthRoutes } from "./routes/health";
import { adminRoutes } from "./routes/admin";
import { queueRoutes } from "./routes/queues";
import { webhookRoutes } from "./routes/webhooks";
import { stateRoutes } from "./routes/states";
import { metricsRoutes } from "./routes/metrics";
import { requestLogger, errorHandler } from "./middleware";
import { authMiddleware } from "./auth.middleware";
import { rateLimiter } from "./rate-limiter";
import { securityHeaders, corsConfig } from "./security";
import { requestIdMiddleware } from "./request-id.middleware";
import { metricsMiddleware } from "./metrics.middleware";

// Create API router with versioning
export const apiRouter = new Hono();

// Global middleware
apiRouter.use("*", cors(corsConfig()));
apiRouter.use("*", securityHeaders);
apiRouter.use("*", requestIdMiddleware);
apiRouter.use("*", metricsMiddleware);
apiRouter.use("*", requestLogger);

// Mount health and metrics routes at root (no auth)
apiRouter.route("/", healthRoutes);
apiRouter.route("/", metricsRoutes);

// API v1 routes
const v1 = new Hono();

// Apply auth and rate limiting to v1 routes
v1.use("*", authMiddleware);
v1.use("*", rateLimiter());

// Mount routes
v1.route("/sessions", sessionRoutes);
v1.route("/messages", messageRoutes);
v1.route("/contacts", contactRoutes);
v1.route("/groups", groupRoutes);
v1.route("/presence", presenceRoutes);
v1.route("/events", eventsRoutes);
v1.route("/admin", adminRoutes);
v1.route("/queues", queueRoutes);
v1.route("/webhooks", webhookRoutes);
v1.route("/states", stateRoutes);

apiRouter.route("/v1", v1);

// Error handler
apiRouter.onError(errorHandler);

export { healthRoutes } from "./routes/health";
