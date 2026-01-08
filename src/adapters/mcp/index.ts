import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { sessionManager } from "@core/session/session.manager";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

const log = logger.child({ component: "mcp" });

// Create MCP server
const server = new McpServer({
    name: "whatsapp-server",
    version: "1.0.0",
});

// ============================================
// TOOLS (Agent Action Allowlist)
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
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not found", code: "SESSION_NOT_FOUND" }) }],
                isError: true,
            };
        }

        if (!session.isConnected()) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not connected", code: "SESSION_NOT_CONNECTED" }) }],
                isError: true,
            };
        }

        try {
            const result = await session.messaging.sendText(to, text);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        messageId: result.messageId,
                        to,
                        timestamp: result.timestamp,
                    }),
                }],
            };
        } catch (err: any) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: err.message, code: "SEND_FAILED" }) }],
                isError: true,
            };
        }
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
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not found", code: "SESSION_NOT_FOUND" }) }],
                isError: true,
            };
        }

        if (!session.isConnected()) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not connected", code: "SESSION_NOT_CONNECTED" }) }],
                isError: true,
            };
        }

        try {
            // Create quoted message structure
            const quotedMessage = {
                key: {
                    remoteJid: to,
                    id: quotedMessageId,
                },
            } as any;

            const result = await session.messaging.reply(to, text, quotedMessage);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        messageId: result.messageId,
                        to,
                        quotedMessageId,
                        timestamp: result.timestamp,
                    }),
                }],
            };
        } catch (err: any) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: err.message, code: "REPLY_FAILED" }) }],
                isError: true,
            };
        }
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
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not found", code: "SESSION_NOT_FOUND" }) }],
                isError: true,
            };
        }

        if (!session.isConnected()) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not connected", code: "SESSION_NOT_CONNECTED" }) }],
                isError: true,
            };
        }

        try {
            const profile = await session.contacts.getProfile(jid);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        profile,
                    }),
                }],
            };
        } catch (err: any) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: err.message, code: "PROFILE_FETCH_FAILED" }) }],
                isError: true,
            };
        }
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
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not found", code: "SESSION_NOT_FOUND" }) }],
                isError: true,
            };
        }

        if (!session.isConnected()) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not connected", code: "SESSION_NOT_CONNECTED" }) }],
                isError: true,
            };
        }

        try {
            const metadata = await session.groups.getMetadata(groupId);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        group: {
                            id: metadata.id,
                            subject: metadata.subject,
                            desc: metadata.desc,
                            owner: metadata.owner,
                            participantCount: metadata.participants.length,
                            creation: metadata.creation,
                        },
                    }),
                }],
            };
        } catch (err: any) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: err.message, code: "GROUP_FETCH_FAILED" }) }],
                isError: true,
            };
        }
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
    async ({ sessionId, jid, duration }) => {
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not found", code: "SESSION_NOT_FOUND" }) }],
                isError: true,
            };
        }

        if (!session.isConnected()) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "Session not connected", code: "SESSION_NOT_CONNECTED" }) }],
                isError: true,
            };
        }

        try {
            await session.presence.showTyping(jid, duration ?? 3000);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        jid,
                        typing: true,
                    }),
                }],
            };
        } catch (err: any) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: err.message, code: "TYPING_FAILED" }) }],
                isError: true,
            };
        }
    }
);

// ============================================
// RESOURCES (Read-only Data Access)
// ============================================

// Resource: contacts list
server.resource(
    "contacts",
    new ResourceTemplate("contacts://{sessionId}/list", { list: undefined }),
    async (uri, { sessionId }) => {
        const session = await sessionManager.getSession(sessionId as string);
        if (!session || !session.isConnected()) {
            return {
                contents: [{
                    uri: uri.href,
                    text: JSON.stringify({ error: "Session not available" }),
                    mimeType: "application/json",
                }],
            };
        }

        const contacts = await session.contacts.getContacts();
        return {
            contents: [{
                uri: uri.href,
                text: JSON.stringify({
                    contacts: contacts.map((c) => ({
                        id: c.id,
                        name: c.name,
                        notify: c.notify,
                    })),
                }),
                mimeType: "application/json",
            }],
        };
    }
);

// Resource: groups list
server.resource(
    "groups",
    new ResourceTemplate("groups://{sessionId}/list", { list: undefined }),
    async (uri, { sessionId }) => {
        // Groups are fetched via getChats, but for now return empty
        // This would require additional implementation in Core
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
    log.info("Starting MCP server on stdio");

    // Set up event forwarding as notifications
    eventBus.on("message.received", (data) => {
        // MCP notifications would go here when supported by transport
        log.debug({ sessionId: data.sessionId, type: data.type }, "Message received (MCP)");
    });

    eventBus.on("message.status", (data) => {
        log.debug({ sessionId: data.sessionId, status: data.status }, "Message status (MCP)");
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    log.info("MCP server connected via stdio");
}

export { server as mcpServer };
