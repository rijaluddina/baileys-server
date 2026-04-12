# LangGraph Agent Integration Guide

## Overview

This server provides MCP (Model Context Protocol) tools for LangGraph agents to interact with WhatsApp. The MCP server uses a **Proxy architecture** — it forwards tool calls to the REST API via HTTP.

## Architecture

```
┌─────────────────────┐
│  LangGraph Agent    │
│  (Any server/cloud) │
└──────────┬──────────┘
           │ stdio / SSH
┌──────────▼──────────┐
│  MCP Server (Proxy) │
│  Rate Limit → fetch │
└──────────┬──────────┘
           │ HTTP + X-API-Key
┌──────────▼──────────┐
│  REST API Server    │
│  Core → Baileys     │
│  → WhatsApp         │
└─────────────────────┘
```

> The MCP server can run on the **same machine** as the REST server or on a **different machine**. See [MCP Architecture](MCP_ARCHITECTURE.md) for deployment options.

## Setup

### 1. Start REST Server

```bash
bun run dev
```

### 2. Create MCP API Key

```bash
curl -X POST http://localhost:3000/v1/admin/api-keys \
  -H "X-API-Key: <admin-key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "langraph-agent", "role": "operator"}'
```

Save the returned key — it is shown only once.

### 3. Start MCP Server

```bash
MCP_API_KEY=wsk_xxxxx bun run mcp
```

---

## MCP Tools

### Messaging

| Tool | Description | REST Endpoint |
|------|-------------|---------------|
| `send_text_message` | Send text message | `POST /v1/messages/send` |
| `send_image` | Send image (URL or base64) | `POST /v1/messages/send-media` |
| `reply_message` | Reply to a message | `POST /v1/messages/send` |

### Contacts & Groups

| Tool | Description | REST Endpoint |
|------|-------------|---------------|
| `get_contact_profile` | Get contact info | `GET /v1/contacts/:jid` |
| `get_group_metadata` | Get group info | `GET /v1/groups/:id` |

### Presence

| Tool | Description | REST Endpoint |
|------|-------------|---------------|
| `set_typing` | Show typing indicator | `POST /v1/presence/:jid/typing` |

### Conversation State

| Tool | Description | REST Endpoint |
|------|-------------|---------------|
| `get_conversation_state` | Get state for JID | `GET /v1/states/:sid/:jid` |
| `update_conversation_state` | Update context | `PUT /v1/states/:sid/:jid` |
| `add_to_history` | Add to history | `PUT /v1/states/:sid/:jid` |
| `clear_conversation_state` | Clear state | `DELETE /v1/states/:sid/:jid` |

---

## Tool Response Format

All tools return JSON in this format:

**Success:**
```json
{
  "messageId": "...",
  "to": "628xxx@s.whatsapp.net",
  "timestamp": "2026-01-08T00:00:00.000Z"
}
```

**Error:**
```json
{
  "error": "Session not found",
  "code": "SESSION_NOT_FOUND"
}
```

**Rate Limited (MCP Layer 2):**
```json
{
  "error": "Rate limit exceeded. Please slow down.",
  "code": "RATE_LIMITED",
  "retryAfterMs": 45000
}
```

---

## Error Codes

| Code | Description | Source |
|------|-------------|--------|
| `SESSION_NOT_FOUND` | Session ID does not exist | REST API |
| `SESSION_NOT_CONNECTED` | WhatsApp not connected | REST API |
| `VALIDATION_ERROR` | Invalid parameters | REST API |
| `UNAUTHORIZED` | Invalid MCP API key | REST API |
| `FORBIDDEN` | Insufficient permissions | REST API |
| `RATE_LIMITED` | Too many requests | MCP Layer 2 or REST Layer 1 |
| `TIMEOUT` | REST API did not respond in 30s | MCP Client |
| `CONNECTION_ERROR` | Cannot reach REST API | MCP Client |

---

## Example Agent Flow

```python
# 1. Receive message event (via webhook)
message = event["data"]
jid = message["from"]
text = message["content"]

# 2. Get conversation state
state = await mcp.call("get_conversation_state", {
    "sessionId": "main",
    "jid": jid
})

# 3. Process with LLM (include state context)
response = await llm.chat([
    {"role": "system", "content": "You are a helpful assistant."},
    *state["history"],
    {"role": "user", "content": text}
])

# 4. Show typing
await mcp.call("set_typing", {
    "sessionId": "main",
    "jid": jid,
    "duration": 2000
})

# 5. Send response
await mcp.call("send_text_message", {
    "sessionId": "main",
    "to": jid,
    "text": response
})

# 6. Update state
await mcp.call("add_to_history", {
    "sessionId": "main",
    "jid": jid,
    "role": "user",
    "content": text
})
await mcp.call("add_to_history", {
    "sessionId": "main",
    "jid": jid,
    "role": "assistant",
    "content": response
})
```

---

## Best Practices

1. **Create a dedicated API key** for MCP with `operator` role
2. **Use typing indicators** for natural feel
3. **Persist state** for multi-turn conversations
4. **Set TTL** on state to auto-cleanup old conversations
5. **Handle errors gracefully** — check for `RATE_LIMITED` and retry with backoff
6. **Monitor MCP logs** for `CONNECTION_ERROR` and `TIMEOUT` to detect connectivity issues

---

## MCP Resources

| Resource | Description |
|----------|-------------|
| `state://{sessionId}/{jid}` | Conversation state |
| `contacts://{sessionId}/list` | Contact list |
| `groups://{sessionId}/list` | Group list |

---

## Event Types

Subscribe via webhooks or SSE (`/v1/events/sse`):

| Event | Description |
|-------|-------------|
| `message.received` | New message |
| `message.sent` | Message sent |
| `message.status` | Delivery status |
| `connection.open` | Connected |
| `connection.close` | Disconnected |
| `qr.update` | QR code update |
