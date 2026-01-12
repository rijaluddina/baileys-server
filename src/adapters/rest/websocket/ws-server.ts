/**
 * WebSocket Server for Real-time Events
 * - Authentication via query param
 * - Heartbeat mechanism
 * - Event filtering/subscription
 * - Graceful shutdown
 */

import { eventBus } from "@infrastructure/events";

type WhatsAppEvent = "message.received" | "message.sent" | "message.status" | "connection.open" | "connection.close" | "qr.update";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "websocket" });

interface WebSocketClient {
    ws: WebSocket;
    sessionId: string;
    subscribedEvents: Set<string>;
    lastPing: number;
    isAlive: boolean;
}

// Active connections
const clients = new Map<string, WebSocketClient>();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;
const PING_TIMEOUT = 10000;

// Heartbeat checker
let heartbeatInterval: Timer | null = null;

/**
 * Start heartbeat checker
 */
function startHeartbeat(): void {
    if (heartbeatInterval) return;

    heartbeatInterval = setInterval(() => {
        const now = Date.now();

        for (const [clientId, client] of clients.entries()) {
            if (!client.isAlive) {
                // Client didn't respond to ping, disconnect
                log.warn({ clientId }, "Client heartbeat timeout, disconnecting");
                client.ws.close(1000, "Heartbeat timeout");
                clients.delete(clientId);
                continue;
            }

            // Send ping
            client.isAlive = false;
            try {
                client.ws.send(JSON.stringify({ type: "ping", timestamp: now }));
            } catch {
                clients.delete(clientId);
            }
        }
    }, HEARTBEAT_INTERVAL);

    log.info("Heartbeat checker started");
}

/**
 * Stop heartbeat checker
 */
function stopHeartbeat(): void {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

/**
 * Handle incoming WebSocket message
 */
function handleMessage(clientId: string, message: string): void {
    const client = clients.get(clientId);
    if (!client) return;

    try {
        const data = JSON.parse(message);

        switch (data.type) {
            case "pong":
                // Client responded to ping
                client.isAlive = true;
                client.lastPing = Date.now();
                break;

            case "subscribe":
                // Subscribe to specific events
                if (Array.isArray(data.events)) {
                    for (const event of data.events) {
                        client.subscribedEvents.add(event);
                    }
                    client.ws.send(JSON.stringify({
                        type: "subscribed",
                        events: Array.from(client.subscribedEvents),
                    }));
                }
                break;

            case "unsubscribe":
                // Unsubscribe from events
                if (Array.isArray(data.events)) {
                    for (const event of data.events) {
                        client.subscribedEvents.delete(event);
                    }
                    client.ws.send(JSON.stringify({
                        type: "unsubscribed",
                        events: data.events,
                    }));
                }
                break;

            default:
                log.debug({ clientId, type: data.type }, "Unknown message type");
        }
    } catch (error) {
        log.warn({ clientId, error }, "Failed to parse WebSocket message");
    }
}

/**
 * Broadcast event to subscribed clients
 */
function broadcastEvent(sessionId: string, eventType: string, data: any): void {
    for (const [clientId, client] of clients.entries()) {
        // Only send to clients watching this session
        if (client.sessionId !== sessionId) continue;

        // Check if subscribed to this event type (or all events)
        if (client.subscribedEvents.size > 0 && !client.subscribedEvents.has(eventType)) {
            continue;
        }

        try {
            client.ws.send(JSON.stringify({
                type: "event",
                event: eventType,
                sessionId,
                data,
                timestamp: Date.now(),
            }));
        } catch {
            clients.delete(clientId);
        }
    }
}

/**
 * Setup event bus listeners for broadcasting
 */
function setupEventListeners(): void {
    const events: WhatsAppEvent[] = [
        "message.received",
        "message.sent",
        "message.status",
        "connection.open",
        "connection.close",
        "qr.update",
    ];

    for (const eventType of events) {
        eventBus.on(eventType, (data) => {
            const sessionId = data.sessionId;
            if (sessionId) {
                broadcastEvent(sessionId, eventType, data);
            }
        });
    }

    log.info({ events }, "WebSocket event listeners registered");
}

/**
 * WebSocket upgrade handler for Bun
 */
export const websocketHandler = {
    open(ws: WebSocket & { data?: { clientId: string; sessionId: string } }) {
        const clientId = ws.data?.clientId || crypto.randomUUID();
        const sessionId = ws.data?.sessionId || "";

        clients.set(clientId, {
            ws,
            sessionId,
            subscribedEvents: new Set(),
            lastPing: Date.now(),
            isAlive: true,
        });

        log.info({ clientId, sessionId }, "WebSocket client connected");

        // Send welcome
        ws.send(JSON.stringify({
            type: "connected",
            clientId,
            sessionId,
        }));

        // Start heartbeat if not running
        if (clients.size === 1) {
            startHeartbeat();
        }
    },

    message(ws: WebSocket & { data?: { clientId: string } }, message: string | Buffer) {
        const clientId = ws.data?.clientId;
        if (clientId) {
            handleMessage(clientId, message.toString());
        }
    },

    close(ws: WebSocket & { data?: { clientId: string } }) {
        const clientId = ws.data?.clientId;
        if (clientId) {
            clients.delete(clientId);
            log.info({ clientId }, "WebSocket client disconnected");
        }

        // Stop heartbeat if no clients
        if (clients.size === 0) {
            stopHeartbeat();
        }
    },
};

/**
 * Graceful shutdown
 */
export function shutdownWebSocket(): void {
    stopHeartbeat();

    for (const [clientId, client] of clients.entries()) {
        try {
            client.ws.close(1001, "Server shutting down");
        } catch { }
    }
    clients.clear();

    log.info("WebSocket server shut down");
}

// Setup event listeners on import
setupEventListeners();

export { clients, broadcastEvent };
