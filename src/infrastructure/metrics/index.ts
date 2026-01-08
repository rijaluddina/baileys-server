import {
    Registry,
    Counter,
    Gauge,
    Histogram,
    collectDefaultMetrics,
} from "prom-client";

// Create a custom registry
export const metricsRegistry = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register: metricsRegistry });

// ===== Message Metrics =====
export const messagesTotal = new Counter({
    name: "whatsapp_messages_total",
    help: "Total number of WhatsApp messages",
    labelNames: ["direction", "type", "session_id"] as const,
    registers: [metricsRegistry],
});

export const messagesSentTotal = new Counter({
    name: "whatsapp_messages_sent_total",
    help: "Total messages sent",
    labelNames: ["session_id", "type"] as const,
    registers: [metricsRegistry],
});

export const messagesReceivedTotal = new Counter({
    name: "whatsapp_messages_received_total",
    help: "Total messages received",
    labelNames: ["session_id", "type"] as const,
    registers: [metricsRegistry],
});

// ===== Connection Metrics =====
export const connectionsActive = new Gauge({
    name: "whatsapp_connections_active",
    help: "Number of active WhatsApp connections",
    labelNames: ["session_id"] as const,
    registers: [metricsRegistry],
});

export const connectionTotal = new Counter({
    name: "whatsapp_connections_total",
    help: "Total connection events",
    labelNames: ["session_id", "event"] as const,
    registers: [metricsRegistry],
});

// ===== Queue Metrics =====
export const queueDepth = new Gauge({
    name: "whatsapp_queue_depth",
    help: "Current queue depth",
    labelNames: ["queue_name", "status"] as const,
    registers: [metricsRegistry],
});

export const queueJobsTotal = new Counter({
    name: "whatsapp_queue_jobs_total",
    help: "Total queue jobs processed",
    labelNames: ["queue_name", "status"] as const,
    registers: [metricsRegistry],
});

// ===== API Metrics =====
export const httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "path", "status"] as const,
    registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "path"] as const,
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [metricsRegistry],
});

// ===== Webhook Metrics =====
export const webhookDeliveriesTotal = new Counter({
    name: "whatsapp_webhook_deliveries_total",
    help: "Total webhook deliveries",
    labelNames: ["status"] as const,
    registers: [metricsRegistry],
});

export const webhookDeliveryDuration = new Histogram({
    name: "whatsapp_webhook_delivery_duration_seconds",
    help: "Webhook delivery duration",
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [metricsRegistry],
});

// ===== Session Metrics =====
export const sessionsActive = new Gauge({
    name: "whatsapp_sessions_active",
    help: "Number of active sessions",
    registers: [metricsRegistry],
});

export const sessionsConnected = new Gauge({
    name: "whatsapp_sessions_connected",
    help: "Number of connected sessions",
    registers: [metricsRegistry],
});
