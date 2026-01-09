/**
 * MCP Test Client - Deterministic tool invoker
 * NO LLM, NO agent - fully scripted and reproducible
 */

import { EventEmitter } from "events";

export interface ToolCallResult {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
}

export interface ToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

/**
 * Simulates MCP tool calls without actual MCP transport
 * Used for testing MCP adapter behavior
 */
export class McpTestClient extends EventEmitter {
    private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<ToolCallResult>>;
    private callHistory: Array<{ tool: string; args: Record<string, unknown>; result: ToolCallResult }> = [];

    constructor() {
        super();
        this.toolHandlers = new Map();
    }

    /**
     * Register a tool handler (mirrors MCP server.tool())
     */
    registerTool(
        name: string,
        handler: (args: Record<string, unknown>) => Promise<ToolCallResult>
    ): void {
        this.toolHandlers.set(name, handler);
    }

    /**
     * Call a tool (simulates agent tool call)
     */
    async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
        const handler = this.toolHandlers.get(name);

        if (!handler) {
            const result: ToolCallResult = {
                content: [{ type: "text", text: JSON.stringify({ error: "Tool not found", code: "TOOL_NOT_FOUND" }) }],
                isError: true,
            };
            this.callHistory.push({ tool: name, args, result });
            return result;
        }

        try {
            const result = await handler(args);
            this.callHistory.push({ tool: name, args, result });
            return result;
        } catch (err: any) {
            const result: ToolCallResult = {
                content: [{ type: "text", text: JSON.stringify({ error: err.message, code: "INTERNAL_ERROR" }) }],
                isError: true,
            };
            this.callHistory.push({ tool: name, args, result });
            return result;
        }
    }

    /**
     * Get call history for assertions
     */
    getCallHistory(): typeof this.callHistory {
        return [...this.callHistory];
    }

    /**
     * Clear call history
     */
    clearHistory(): void {
        this.callHistory = [];
    }

    /**
     * Check if a tool exists (for allowlist testing)
     */
    hasToolOf(name: string): boolean {
        return this.toolHandlers.has(name);
    }

    /**
     * Get all registered tool names
     */
    getRegisteredTools(): string[] {
        return Array.from(this.toolHandlers.keys());
    }
}

// Allowlist of permitted MCP tools
export const MCP_ALLOWLIST = [
    "send_text_message",
    "reply_message",
    "get_contact_profile",
    "get_group_metadata",
    "set_typing",
    "get_conversation_state",
    "update_conversation_state",
    "add_to_history",
    "clear_conversation_state",
] as const;

// Explicitly forbidden tools (even if Core supports them)
export const MCP_DENYLIST = [
    "delete_session",
    "create_session",
    "raw_socket_access",
    "modify_credentials",
    "export_auth_state",
    "import_auth_state",
    "execute_raw_command",
    "list_all_sessions",
    "revoke_api_key",
] as const;

export type AllowedTool = typeof MCP_ALLOWLIST[number];
export type DeniedTool = typeof MCP_DENYLIST[number];
