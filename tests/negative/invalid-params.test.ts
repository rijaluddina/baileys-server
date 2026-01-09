/**
 * Negative Tests - Invalid Parameters
 * - Empty sessionId → validation error
 * - Malformed JID → validation error
 * - Oversized message → rejected
 */

import { describe, it, expect, beforeEach } from "vitest";
import { McpTestClient } from "../utils/mcp-test-client";

// Validation function (would be in actual MCP adapter)
function validateParams(tool: string, args: Record<string, unknown>): { valid: boolean; error?: string } {
    const sessionId = args.sessionId as string | undefined;
    const jid = (args.jid || args.to) as string | undefined;
    const text = args.text as string | undefined;

    // Common validations
    if (sessionId === undefined || sessionId === null || sessionId === "") {
        return { valid: false, error: "sessionId required" };
    }

    if (typeof sessionId !== "string") {
        return { valid: false, error: "sessionId must be string" };
    }

    if (sessionId.length > 100) {
        return { valid: false, error: "sessionId exceeds max length" };
    }

    // JID validation for messaging tools
    if (["send_text_message", "reply_message", "set_typing"].includes(tool)) {
        if (!jid) {
            return { valid: false, error: "jid/to required" };
        }

        if (typeof jid !== "string") {
            return { valid: false, error: "jid must be string" };
        }

        // Basic JID format check
        if (!jid.includes("@")) {
            return { valid: false, error: "invalid JID format" };
        }

        // Valid suffixes
        const validSuffixes = ["@s.whatsapp.net", "@g.us", "@broadcast"];
        if (!validSuffixes.some((s) => jid.endsWith(s))) {
            return { valid: false, error: "invalid JID suffix" };
        }
    }

    // Text validation for send_text_message
    if (tool === "send_text_message") {
        if (!text) {
            return { valid: false, error: "text required" };
        }

        if (typeof text !== "string") {
            return { valid: false, error: "text must be string" };
        }

        if (text.length > 65536) {
            return { valid: false, error: "text exceeds max length" };
        }
    }

    return { valid: true };
}

describe("Invalid Parameters", () => {
    let mcpClient: McpTestClient;

    beforeEach(() => {
        mcpClient = new McpTestClient();

        // Register tool with validation
        mcpClient.registerTool("send_text_message", async (args) => {
            const validation = validateParams("send_text_message", args);

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

    describe("Empty/Missing sessionId", () => {
        it("should reject empty string sessionId", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "",
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("sessionId required");
        });

        it("should reject missing sessionId", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
        });

        it("should reject null sessionId", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: null,
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
        });

        it("should reject undefined sessionId", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: undefined,
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("Malformed JID", () => {
        it("should reject JID without @", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234567890",
                text: "test",
            });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("invalid JID format");
        });

        it("should reject JID with invalid suffix", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234@invalid.domain",
                text: "test",
            });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("invalid JID suffix");
        });

        it("should accept valid s.whatsapp.net JID", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234567890@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBeFalsy();
        });

        it("should accept valid g.us JID (group)", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234567890-1234567890@g.us",
                text: "test",
            });

            expect(result.isError).toBeFalsy();
        });
    });

    describe("Oversized Message", () => {
        it("should reject message text exceeding 65536 chars", async () => {
            const oversizedText = "a".repeat(70000);

            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234@s.whatsapp.net",
                text: oversizedText,
            });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("text exceeds max length");
        });

        it("should accept message at max length (65536)", async () => {
            const maxText = "a".repeat(65536);

            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234@s.whatsapp.net",
                text: maxText,
            });

            expect(result.isError).toBeFalsy();
        });
    });

    describe("Type Mismatches", () => {
        it("should reject number as sessionId", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: 12345,
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
        });

        it("should reject array as sessionId", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: ["main"],
                to: "1234@s.whatsapp.net",
                text: "test",
            });

            expect(result.isError).toBe(true);
        });

        it("should reject object as text", async () => {
            const result = await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234@s.whatsapp.net",
                text: { message: "hello" },
            });

            expect(result.isError).toBe(true);
        });
    });
});
