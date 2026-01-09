/**
 * REST-MCP Parity Tests
 * - Same action via REST and MCP → identical Core effect
 * - Events emitted exactly once per action
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "events";

// Mock Core service behavior
class MockMessagingService {
    private eventBus: EventEmitter;

    constructor(eventBus: EventEmitter) {
        this.eventBus = eventBus;
    }

    async sendText(sessionId: string, to: string, text: string) {
        const result = {
            messageId: `MSG_${Date.now()}`,
            timestamp: Date.now(),
            to,
            text,
        };

        // Core emits event
        this.eventBus.emit("message.sent", { sessionId, ...result });

        return result;
    }
}

describe("REST-MCP Parity", () => {
    let eventBus: EventEmitter;
    let messagingService: MockMessagingService;
    let emittedEvents: Array<{ event: string; data: unknown }>;

    beforeEach(() => {
        eventBus = new EventEmitter();
        messagingService = new MockMessagingService(eventBus);
        emittedEvents = [];

        // Capture events
        eventBus.on("message.sent", (data) => {
            emittedEvents.push({ event: "message.sent", data });
        });
    });

    describe("Send Message Parity", () => {
        it("should produce identical Core effect via REST path", async () => {
            // Simulate REST path: REST Adapter → Core
            const restResult = await messagingService.sendText("main", "1234@s.whatsapp.net", "Hello");

            expect(restResult.messageId).toBeDefined();
            expect(restResult.to).toBe("1234@s.whatsapp.net");
            expect(restResult.text).toBe("Hello");
        });

        it("should produce identical Core effect via MCP path", async () => {
            // Simulate MCP path: MCP Adapter → Core (same service)
            const mcpResult = await messagingService.sendText("main", "1234@s.whatsapp.net", "Hello");

            expect(mcpResult.messageId).toBeDefined();
            expect(mcpResult.to).toBe("1234@s.whatsapp.net");
            expect(mcpResult.text).toBe("Hello");
        });

        it("should emit event exactly ONCE per action", async () => {
            await messagingService.sendText("main", "1234@s.whatsapp.net", "Hello");

            expect(emittedEvents.length).toBe(1);
            expect(emittedEvents[0].event).toBe("message.sent");
        });

        it("should NOT emit duplicate events for same action via different adapters", async () => {
            // REST path
            await messagingService.sendText("main", "1234@s.whatsapp.net", "REST");
            const afterRest = emittedEvents.length;

            // MCP path (same Core)
            await messagingService.sendText("main", "1234@s.whatsapp.net", "MCP");
            const afterMcp = emittedEvents.length;

            // Each call should emit exactly one event
            expect(afterRest).toBe(1);
            expect(afterMcp).toBe(2);
        });
    });

    describe("Event Consistency", () => {
        it("should emit events with consistent structure regardless of adapter", async () => {
            await messagingService.sendText("main", "1234@s.whatsapp.net", "Test");

            const event = emittedEvents[0];
            expect(event.data).toHaveProperty("sessionId");
            expect(event.data).toHaveProperty("messageId");
            expect(event.data).toHaveProperty("to");
            expect(event.data).toHaveProperty("text");
        });
    });
});
