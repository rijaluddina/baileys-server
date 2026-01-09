/**
 * Negative Tests - Forbidden Tools
 * - delete_session via MCP → DENIED
 * - raw_socket_access via MCP → DENIED
 * - modify_credentials via MCP → DENIED
 */

import { describe, it, expect, beforeEach } from "vitest";
import { McpTestClient, MCP_DENYLIST } from "../utils/mcp-test-client";

describe("Forbidden Tools", () => {
    let mcpClient: McpTestClient;

    beforeEach(() => {
        mcpClient = new McpTestClient();
        // Note: We intentionally do NOT register denylist tools
    });

    describe("Session Management (Forbidden)", () => {
        it("should DENY delete_session", async () => {
            const result = await mcpClient.callTool("delete_session", {
                sessionId: "main",
            });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.code).toBe("TOOL_NOT_FOUND");
        });

        it("should DENY create_session", async () => {
            const result = await mcpClient.callTool("create_session", {
                sessionId: "new_session",
            });

            expect(result.isError).toBe(true);
        });

        it("should DENY list_all_sessions", async () => {
            const result = await mcpClient.callTool("list_all_sessions", {});

            expect(result.isError).toBe(true);
        });
    });

    describe("Credentials (Forbidden)", () => {
        it("should DENY modify_credentials", async () => {
            const result = await mcpClient.callTool("modify_credentials", {
                sessionId: "main",
                creds: { fakeKey: "value" },
            });

            expect(result.isError).toBe(true);
        });

        it("should DENY export_auth_state", async () => {
            const result = await mcpClient.callTool("export_auth_state", {
                sessionId: "main",
            });

            expect(result.isError).toBe(true);
        });

        it("should DENY import_auth_state", async () => {
            const result = await mcpClient.callTool("import_auth_state", {
                sessionId: "main",
                state: {},
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("Low-Level Access (Forbidden)", () => {
        it("should DENY raw_socket_access", async () => {
            const result = await mcpClient.callTool("raw_socket_access", {
                command: "any_command",
            });

            expect(result.isError).toBe(true);
        });

        it("should DENY execute_raw_command", async () => {
            const result = await mcpClient.callTool("execute_raw_command", {
                command: "ws.send({})",
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("Admin Operations (Forbidden)", () => {
        it("should DENY revoke_api_key", async () => {
            const result = await mcpClient.callTool("revoke_api_key", {
                keyId: "some-key-id",
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("All Denylist Tools", () => {
        it("should DENY every tool in the denylist", async () => {
            for (const tool of MCP_DENYLIST) {
                const result = await mcpClient.callTool(tool, {
                    sessionId: "main",
                    anyParam: "value",
                });

                expect(result.isError).toBe(true);
                const response = JSON.parse(result.content[0].text);
                expect(response.code).toBe("TOOL_NOT_FOUND");
            }
        });
    });
});
