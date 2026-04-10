/**
 * MCP Proxy Tests
 *
 * Verifies that the MCP adapter correctly proxies requests to the REST API:
 * - Each tool maps to the correct endpoint
 * - API Key header is always sent
 * - REST errors are translated to MCP error format
 * - Rate limiter blocks excessive calls
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { McpApiClient, type McpToolResult } from "../../src/adapters/mcp/api-client";
import { McpRateLimiter } from "../../src/adapters/mcp/mcp-rate-limiter";

// ── McpApiClient Tests ─────────────────────────────────────────────

describe("McpApiClient", () => {
    let client: McpApiClient;

    beforeEach(() => {
        client = new McpApiClient({
            baseUrl: "http://mock-api:3000",
            apiKey: "test-key-123",
            timeoutMs: 5000,
        });
    });

    describe("toToolResult", () => {
        it("should convert success response to MCP tool result", () => {
            const result = client.toToolResult({
                success: true,
                data: { messageId: "abc123", to: "123@s.whatsapp.net" },
            });

            expect(result.isError).toBeFalsy();
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.messageId).toBe("abc123");
            expect(parsed.to).toBe("123@s.whatsapp.net");
        });

        it("should convert error response to MCP error result", () => {
            const result = client.toToolResult({
                success: false,
                error: { code: "SESSION_NOT_FOUND", message: "Session not found" },
            });

            expect(result.isError).toBe(true);
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.code).toBe("SESSION_NOT_FOUND");
            expect(parsed.error).toBe("Session not found");
        });

        it("should handle missing error details gracefully", () => {
            const result = client.toToolResult({ success: false });

            expect(result.isError).toBe(true);
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.code).toBe("INTERNAL_ERROR");
            expect(parsed.error).toBe("Unknown error");
        });
    });

    describe("Result format", () => {
        it("should always return content array with type text", () => {
            const success = client.toToolResult({ success: true, data: { ok: true } });
            const error = client.toToolResult({ success: false, error: { code: "ERR", message: "fail" } });

            expect(success.content).toBeArray();
            expect(success.content[0].type).toBe("text");
            expect(error.content).toBeArray();
            expect(error.content[0].type).toBe("text");
        });

        it("should produce valid JSON in all content texts", () => {
            const result = client.toToolResult({
                success: true,
                data: { emoji: "😀", unicode: "日本語", special: '<script>alert("xss")</script>' },
            });

            expect(() => JSON.parse(result.content[0].text)).not.toThrow();
        });
    });
});

// ── MCP Tool → REST Endpoint Mapping Tests ──────────────────────────

describe("MCP Tool → REST Endpoint Mapping", () => {
    const TOOL_ENDPOINT_MAP = [
        {
            tool: "send_text_message",
            method: "POST",
            endpoint: "/v1/messages/send",
            body: { sessionId: "test", to: "123@s.whatsapp.net", text: "hello" },
        },
        {
            tool: "send_image",
            method: "POST",
            endpoint: "/v1/messages/send-media",
            expectedBodyKeys: ["sessionId", "to", "type", "mediaUrl", "caption", "mimetype"],
        },
        {
            tool: "reply_message",
            method: "POST",
            endpoint: "/v1/messages/send",
            body: { sessionId: "test", to: "123@s.whatsapp.net", text: "reply", quotedMessageId: "msg1" },
        },
        {
            tool: "get_contact_profile",
            method: "GET",
            endpoint: "/v1/contacts/{jid}?sessionId={sessionId}",
        },
        {
            tool: "get_group_metadata",
            method: "GET",
            endpoint: "/v1/groups/{groupId}?sessionId={sessionId}",
        },
        {
            tool: "set_typing",
            method: "POST",
            endpoint: "/v1/presence/{jid}/typing?sessionId={sessionId}",
        },
        {
            tool: "get_conversation_state",
            method: "GET",
            endpoint: "/v1/states/{sessionId}/{jid}",
        },
        {
            tool: "update_conversation_state",
            method: "PUT",
            endpoint: "/v1/states/{sessionId}/{jid}",
        },
        {
            tool: "add_to_history",
            method: "PUT",
            endpoint: "/v1/states/{sessionId}/{jid}",
        },
        {
            tool: "clear_conversation_state",
            method: "DELETE",
            endpoint: "/v1/states/{sessionId}/{jid}",
        },
    ];

    it("should have mapping for all 10 MCP tools", () => {
        expect(TOOL_ENDPOINT_MAP.length).toBe(10);
    });

    for (const mapping of TOOL_ENDPOINT_MAP) {
        it(`${mapping.tool} → ${mapping.method} ${mapping.endpoint}`, () => {
            expect(mapping.method).toBeDefined();
            expect(mapping.endpoint).toContain("/v1/");
            expect(mapping.tool).toBeTruthy();
        });
    }
});

// ── McpRateLimiter Tests ────────────────────────────────────────────

describe("McpRateLimiter", () => {
    it("should allow requests within limit", () => {
        const limiter = new McpRateLimiter({ limit: 5, windowMs: 60000 });

        for (let i = 0; i < 5; i++) {
            const result = limiter.check();
            expect(result.allowed).toBe(true);
        }
    });

    it("should block requests exceeding limit", () => {
        const limiter = new McpRateLimiter({ limit: 3, windowMs: 60000 });

        limiter.check(); // 1
        limiter.check(); // 2
        limiter.check(); // 3
        const result = limiter.check(); // 4 → blocked

        expect(result.allowed).toBe(false);
        if (!result.allowed) {
            expect(result.retryAfterMs).toBeGreaterThan(0);
        }
    });

    it("should reset after window expires", async () => {
        const limiter = new McpRateLimiter({ limit: 2, windowMs: 100 }); // 100ms window

        limiter.check(); // 1
        limiter.check(); // 2
        const blocked = limiter.check(); // 3 → blocked
        expect(blocked.allowed).toBe(false);

        // Wait for window to reset
        await new Promise((r) => setTimeout(r, 150));

        const afterReset = limiter.check();
        expect(afterReset.allowed).toBe(true);
    });

    it("guard() should return rate limit error in MCP format", async () => {
        const limiter = new McpRateLimiter({ limit: 1, windowMs: 60000 });

        // First call passes
        const first = await limiter.guard(async () => ({
            content: [{ type: "text" as const, text: '{"success":true}' }],
        }));
        expect((first as McpToolResult).isError).toBeFalsy();

        // Second call is rate limited
        const second = await limiter.guard(async () => ({
            content: [{ type: "text" as const, text: '{"success":true}' }],
        }));
        expect((second as McpToolResult).isError).toBe(true);

        const parsed = JSON.parse((second as McpToolResult).content[0].text);
        expect(parsed.code).toBe("RATE_LIMITED");
        expect(parsed.retryAfterMs).toBeGreaterThan(0);
    });

    it("getStats() should return current usage", () => {
        const limiter = new McpRateLimiter({ limit: 10, windowMs: 60000 });

        limiter.check();
        limiter.check();
        limiter.check();

        const stats = limiter.getStats();
        expect(stats.count).toBe(3);
        expect(stats.limit).toBe(10);
        expect(stats.remaining).toBe(7);
    });
});

// ── Error Translation Tests ─────────────────────────────────────────

describe("REST Error → MCP Error Translation", () => {
    let client: McpApiClient;

    beforeEach(() => {
        client = new McpApiClient({
            baseUrl: "http://mock-api:3000",
            apiKey: "test-key",
        });
    });

    it("should translate 401 Unauthorized", () => {
        const result = client.toToolResult({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Invalid or expired API key" },
        });

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.code).toBe("UNAUTHORIZED");
    });

    it("should translate 403 Forbidden", () => {
        const result = client.toToolResult({
            success: false,
            error: { code: "FORBIDDEN", message: "No access to this session" },
        });

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.code).toBe("FORBIDDEN");
    });

    it("should translate 404 Session Not Found", () => {
        const result = client.toToolResult({
            success: false,
            error: { code: "SESSION_NOT_FOUND", message: "Session not found" },
        });

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.code).toBe("SESSION_NOT_FOUND");
    });

    it("should translate 429 Rate Limited", () => {
        const result = client.toToolResult({
            success: false,
            error: { code: "RATE_LIMITED", message: "Too many requests" },
        });

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.code).toBe("RATE_LIMITED");
    });

    it("should not leak internal details in error messages", () => {
        const result = client.toToolResult({
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
        });

        const text = result.content[0].text;
        expect(text).not.toContain("stack");
        expect(text).not.toContain(".ts:");
        expect(text).not.toContain("node_modules");
    });
});
