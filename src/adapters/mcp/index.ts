import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { logger } from "@infrastructure/logger";
import { McpApiClient } from "./api-client";
import { McpRateLimiter } from "./mcp-rate-limiter";

const log = logger.child({ component: "mcp" });

// Initialize proxy client & rate limiter
const client = new McpApiClient();
const limiter = new McpRateLimiter();

// Create MCP server
const server = new McpServer({
    name: "whatsapp-server",
    version: "1.0.0",
});

// ============================================
// TOOLS (Agent Action Allowlist — Proxy to REST)
// ============================================

// Tool: send_text_message
server.tool(
    "send_text_message",
    "Send a text message to a WhatsApp contact or group",
    {
        sessionId: z.string().describe("The session ID to use"),
        to: z.string().describe("Recipient JID (phone@s.whatsapp.net or group@g.us)"),
        text: z.string().describe("Message text content"),
    },
    async ({ sessionId, to, text }) => {
        return limiter.guard(() =>
            client.proxyPost("/v1/messages/send", { sessionId, to, text })
        );
    }
);

// Tool: send_image
server.tool(
    "send_image",
    "Send an image to a WhatsApp contact or group (max 5MB). Provide either imageUrl or imageBase64.",
    {
        sessionId: z.string().describe("The session ID to use"),
        to: z.string().describe("Recipient JID (phone@s.whatsapp.net or group@g.us)"),
        imageUrl: z.string().url().optional().describe("URL of the image to send"),
        imageBase64: z.string().optional().describe("Base64 encoded image data"),
        caption: z.string().optional().describe("Optional caption for the image"),
    },
    async ({ sessionId, to, imageUrl, imageBase64, caption }) => {
        return limiter.guard(() =>
            client.proxyPost("/v1/messages/send-media", {
                sessionId,
                to,
                type: "image",
                mediaUrl: imageUrl,
                mediaBase64: imageBase64,
                caption,
                mimetype: "image/jpeg",
            })
        );
    }
);

// Tool: reply_message
server.tool(
    "reply_message",
    "Reply to a specific message in a WhatsApp conversation",
    {
        sessionId: z.string().describe("The session ID to use"),
        to: z.string().describe("Chat JID where the reply will be sent"),
        text: z.string().describe("Reply text content"),
        quotedMessageId: z.string().describe("ID of the message to reply to"),
    },
    async ({ sessionId, to, text, quotedMessageId }) => {
        return limiter.guard(() =>
            client.proxyPost("/v1/messages/send", { sessionId, to, text, quotedMessageId })
        );
    }
);

// Tool: get_contact_profile
server.tool(
    "get_contact_profile",
    "Get profile information for a WhatsApp contact",
    {
        sessionId: z.string().describe("The session ID to use"),
        jid: z.string().describe("Contact JID (phone@s.whatsapp.net)"),
    },
    async ({ sessionId, jid }) => {
        return limiter.guard(() =>
            client.proxyGet(`/v1/contacts/${encodeURIComponent(jid)}?sessionId=${encodeURIComponent(sessionId)}`)
        );
    }
);

// Tool: get_group_metadata
server.tool(
    "get_group_metadata",
    "Get metadata for a WhatsApp group",
    {
        sessionId: z.string().describe("The session ID to use"),
        groupId: z.string().describe("Group JID (id@g.us)"),
    },
    async ({ sessionId, groupId }) => {
        return limiter.guard(() =>
            client.proxyGet(`/v1/groups/${encodeURIComponent(groupId)}?sessionId=${encodeURIComponent(sessionId)}`)
        );
    }
);

// Tool: set_typing
server.tool(
    "set_typing",
    "Show typing indicator in a WhatsApp chat",
    {
        sessionId: z.string().describe("The session ID to use"),
        jid: z.string().describe("Chat JID to show typing in"),
        duration: z.number().optional().describe("Duration in ms (default 3000)"),
    },
    async ({ sessionId, jid }) => {
        return limiter.guard(() =>
            client.proxyPost(`/v1/presence/${encodeURIComponent(jid)}/typing?sessionId=${encodeURIComponent(sessionId)}`, {})
        );
    }
);

// ============================================
// CONVERSATION STATE TOOLS
// ============================================

// Tool: get_conversation_state
server.tool(
    "get_conversation_state",
    "Get the conversation state for a specific chat JID",
    {
        sessionId: z.string().describe("The session ID"),
        jid: z.string().describe("Chat JID"),
    },
    async ({ sessionId, jid }) => {
        return limiter.guard(() =>
            client.proxyGet(`/v1/states/${encodeURIComponent(sessionId)}/${encodeURIComponent(jid)}`)
        );
    }
);

// Tool: update_conversation_state
server.tool(
    "update_conversation_state",
    "Update the conversation state for a chat JID",
    {
        sessionId: z.string().describe("The session ID"),
        jid: z.string().describe("Chat JID"),
        context: z.record(z.unknown()).optional().describe("Context data to merge"),
        agentId: z.string().optional().describe("Agent identifier"),
        ttlMinutes: z.number().optional().describe("TTL in minutes"),
    },
    async ({ sessionId, jid, context, agentId, ttlMinutes }) => {
        return limiter.guard(() =>
            client.proxyPut(`/v1/states/${encodeURIComponent(sessionId)}/${encodeURIComponent(jid)}`, {
                context,
                agentId,
                ttlMinutes,
            })
        );
    }
);

// Tool: add_to_history
server.tool(
    "add_to_history",
    "Add a message to the conversation history",
    {
        sessionId: z.string().describe("The session ID"),
        jid: z.string().describe("Chat JID"),
        role: z.enum(["user", "assistant", "system"]).describe("Message role"),
        content: z.string().describe("Message content"),
    },
    async ({ sessionId, jid, role, content }) => {
        return limiter.guard(() =>
            client.proxyPut(`/v1/states/${encodeURIComponent(sessionId)}/${encodeURIComponent(jid)}`, {
                history: [{ role, content, timestamp: new Date().toISOString() }],
            })
        );
    }
);

// Tool: clear_conversation_state
server.tool(
    "clear_conversation_state",
    "Clear the conversation state for a chat JID",
    {
        sessionId: z.string().describe("The session ID"),
        jid: z.string().describe("Chat JID"),
    },
    async ({ sessionId, jid }) => {
        return limiter.guard(() =>
            client.proxyDelete(`/v1/states/${encodeURIComponent(sessionId)}/${encodeURIComponent(jid)}`)
        );
    }
);

// ============================================
// RESOURCES (Read-only Data Access — Proxy)
// ============================================

// Resource: conversation state
server.resource(
    "state",
    new ResourceTemplate("state://{sessionId}/{jid}", { list: undefined }),
    async (uri, { sessionId, jid }) => {
        const result = await client.get(`/v1/states/${encodeURIComponent(sessionId as string)}/${encodeURIComponent(jid as string)}`);

        return {
            contents: [{
                uri: uri.href,
                text: JSON.stringify(result.success ? result.data : { exists: false }),
                mimeType: "application/json",
            }],
        };
    }
);

// Resource: contacts list
server.resource(
    "contacts",
    new ResourceTemplate("contacts://{sessionId}/list", { list: undefined }),
    async (uri, { sessionId }) => {
        const result = await client.get(`/v1/contacts?sessionId=${encodeURIComponent(sessionId as string)}`);

        return {
            contents: [{
                uri: uri.href,
                text: JSON.stringify(result.success ? result.data : { error: "Session not available" }),
                mimeType: "application/json",
            }],
        };
    }
);

// Resource: groups list (placeholder)
server.resource(
    "groups",
    new ResourceTemplate("groups://{sessionId}/list", { list: undefined }),
    async (uri) => {
        return {
            contents: [{
                uri: uri.href,
                text: JSON.stringify({
                    groups: [],
                    note: "Group listing requires chat store implementation",
                }),
                mimeType: "application/json",
            }],
        };
    }
);

// ============================================
// Start MCP Server
// ============================================

export async function startMcpServer(): Promise<void> {
    log.info("Starting MCP server on stdio (proxy mode)");

    const transport = new StdioServerTransport();
    await server.connect(transport);

    log.info({
        mode: "proxy",
        targetApi: process.env.MCP_API_BASE_URL ?? "http://localhost:3000",
        rateLimitStats: limiter.getStats(),
    }, "MCP server connected via stdio");
}

export { server as mcpServer };
