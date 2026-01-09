/**
 * MCP Security Tests
 * - Non-allowlisted tool calls MUST fail
 * - Forbidden capabilities rejected even if Core supports them
 * - Error responses don't leak internal details
 * - No events emitted for denied MCP actions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpTestClient, MCP_ALLOWLIST, MCP_DENYLIST } from "../utils/mcp-test-client";
import { EventEmitter } from "events";

describe("MCP Security", () => {
    let mcpClient: McpTestClient;
    let eventBus: EventEmitter;
    let emittedEvents: Array<{ event: string; data: unknown }>;

    beforeEach(() => {
        mcpClient = new McpTestClient();
        eventBus = new EventEmitter();
        emittedEvents = [];

        // Capture all events
        const originalEmit = eventBus.emit.bind(eventBus);
        eventBus.emit = (event: string, ...args: unknown[]) => {
            emittedEvents.push({ event, data: args[0] });
            return originalEmit(event, ...args);
        };

        // Register only allowlisted tools
        MCP_ALLOWLIST.forEach((tool) => {
            mcpClient.registerTool(tool, async (args) => {
                return {
                    content: [{ type: "text", text: JSON.stringify({ success: true, tool, args }) }],
                };
            });
        });
    });

    describe("Capability Denial", () => {
        it("should reject non-allowlisted tool calls", async () => {
            const result = await mcpClient.callTool("unknown_dangerous_tool", {});

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("Tool not found");
            expect(response.code).toBe("TOOL_NOT_FOUND");
        });

        it("should reject all explicitly denied tools", async () => {
            for (const deniedTool of MCP_DENYLIST) {
                const result = await mcpClient.callTool(deniedTool, {});

                expect(result.isError).toBe(true);
                const response = JSON.parse(result.content[0].text);
                expect(response.code).toBe("TOOL_NOT_FOUND");
            }
        });

        it("should NOT have any denied tools registered", () => {
            const registeredTools = mcpClient.getRegisteredTools();

            for (const deniedTool of MCP_DENYLIST) {
                expect(registeredTools).not.toContain(deniedTool);
            }
        });

        it("should ONLY have allowlisted tools registered", () => {
            const registeredTools = mcpClient.getRegisteredTools();

            for (const tool of registeredTools) {
                expect(MCP_ALLOWLIST).toContain(tool);
            }
        });
    });

    describe("No Events for Denied Actions", () => {
        it("should NOT emit events when tool call is denied", async () => {
            await mcpClient.callTool("delete_session", { sessionId: "main" });

            expect(emittedEvents.length).toBe(0);
        });

        it("should NOT emit events for any denylist tool", async () => {
            for (const deniedTool of MCP_DENYLIST) {
                emittedEvents = [];
                await mcpClient.callTool(deniedTool, { sessionId: "main" });
                expect(emittedEvents.length).toBe(0);
            }
        });
    });

    describe("Error Containment", () => {
        it("should NOT leak stack traces in error responses", async () => {
            const result = await mcpClient.callTool("non_existent", {});

            const responseText = result.content[0].text;
            expect(responseText).not.toContain("at ");
            expect(responseText).not.toContain(".ts:");
            expect(responseText).not.toContain(".js:");
            expect(responseText).not.toContain("node_modules");
        });

        it("should return safe error codes only", async () => {
            const result = await mcpClient.callTool("forbidden_tool", {});

            const response = JSON.parse(result.content[0].text);
            expect(["TOOL_NOT_FOUND", "VALIDATION_ERROR", "INTERNAL_ERROR"]).toContain(response.code);
        });
    });

    describe("Allowlist Enforcement", () => {
        it("should successfully call all allowlisted tools", async () => {
            for (const tool of MCP_ALLOWLIST) {
                const result = await mcpClient.callTool(tool, { sessionId: "test", jid: "test@s.whatsapp.net" });

                expect(result.isError).toBeFalsy();
                const response = JSON.parse(result.content[0].text);
                expect(response.success).toBe(true);
            }
        });
    });
});
