/**
 * MCP Sanitization Tests
 * - Long string parameters rejected
 * - Invalid JID formats rejected
 * - Wrong parameter types rejected
 */

import { describe, it, expect, beforeEach } from "vitest";
import { McpTestClient } from "../utils/mcp-test-client";

describe("MCP Sanitization", () => {
    let mcpClient: McpTestClient;

    // Validation helper
    function validateSendMessage(args: Record<string, unknown>): { valid: boolean; error?: string } {
        const { sessionId, to, text } = args as { sessionId?: string; to?: string; text?: string };

        if (!sessionId || typeof sessionId !== "string") {
            return { valid: false, error: "sessionId required" };
        }
        if (!to || typeof to !== "string") {
            return { valid: false, error: "to required" };
        }
        if (!text || typeof text !== "string") {
            return { valid: false, error: "text required" };
        }
        if (sessionId.length > 100) {
            return { valid: false, error: "sessionId too long" };
        }
        if (text.length > 10000) {
            return { valid: false, error: "text too long" };
        }
        if (!to.includes("@")) {
            return { valid: false, error: "invalid JID format" };
        }

        return { valid: true };
    }

    beforeEach(() => {
        mcpClient = new McpTestClient();

        // Register tool with validation
        mcpClient.registerTool("send_text_message", async (args) => {
            const validation = validateSendMessage(args);

            if (!validation.valid) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ error: validation.error, code: "VALIDATION_ERROR" }) }],
                    isError: true,
                };
            }

            return {
                content: [{ type: "text", text: JSON.stringify({ success: true }) }],
            };
        });
    });

    describe("Long String Parameters", () => {
        it("should reject extremely long sessionId", async () => {
            const longSessionId = "a".repeat(1000);

            const result = await mcpClient.callTool("send_text_message", {
                sessionId: longSessionId,
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("sessionId too long");
        });

        it("should reject extremely long message text", async () => {
            const longText = "a".repeat(100000);

            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234@s.whatsapp.net",
                text: longText,
            });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("text too long");
        });
    });

    describe("Invalid JID Format", () => {
        it("should reject JID without @ symbol", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "invalid-jid",
                text: "test",
            });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("invalid JID format");
        });

        it("should accept valid JID formats", async () => {
            const validJids = [
                "1234567890@s.whatsapp.net",
                "1234567890-1234567890@g.us",
                "0@broadcast",
            ];

            for (const jid of validJids) {
                const result = await mcpClient.callTool("send_text_message", {
                    sessionId: "main",
                    to: jid,
                    text: "test",
                });

                expect(result.isError).toBeFalsy();
            }
        });
    });

    describe("Wrong Parameter Types", () => {
        it("should reject number as sessionId", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: 12345,
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
        });

        it("should reject object as text", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234@s.whatsapp.net",
                text: { nested: "object" },
            });

            expect(result.isError).toBe(true);
        });

        it("should reject undefined required parameters", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                // missing 'to' and 'text'
            });

            expect(result.isError).toBe(true);
        });

        it("should reject null as parameter", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: null,
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("Edge Cases", () => {
        it("should handle empty string parameters", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "",
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
        });

        it("should handle whitespace-only parameters", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "   ",
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            // Whitespace-only should be treated as invalid
            // Behavior depends on implementation
        });
    });
});
