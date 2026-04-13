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

All tools return content in text format.

**Success:**
```json
{
  "status": "queued",
  "id": "ABCD1234",
  "to": "628xxx@s.whatsapp.net",
  "timestamp": 1704672000
}
```

> Messages are queued for delivery. Status updates (delivered/read) arrive
> asynchronously via `message.status` events.

**Error (natural language):**

When errors occur, MCP translates technical error codes into natural-language messages:

```
"Failed to send. The WhatsApp connection is currently down.
 Please inform the user to try again later."
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

| Code | Description | LLM Message |
|------|-------------|-------------|
| `SESSION_NOT_FOUND` | Session does not exist | "WhatsApp session not found. Make sure the session has been created and is active." |
| `SESSION_NOT_CONNECTED` | WhatsApp not connected | "WhatsApp session is not connected yet. Ask the user to scan the QR code first." |
| `WHATSAPP_DISCONNECTED` | Circuit breaker open | "Failed to send. The WhatsApp connection is currently down." |
| `VALIDATION_ERROR` | Invalid parameters | "Invalid request: [details]" |
| `RATE_LIMITED` | Too many requests | "Rate limit reached. Please wait a moment before trying again." |
| `TIMEOUT` | REST API did not respond in 30s | "The request timed out. The WhatsApp server may be slow." |
| `CONNECTION_ERROR` | Cannot reach REST API | "Could not reach the WhatsApp server. Please check the service status." |
| `UNAUTHORIZED` | Invalid MCP API key | Natural-language error message |
| `FORBIDDEN` | Insufficient permissions | Natural-language error message |

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
5. **Handle errors gracefully** — MCP returns natural-language error messages, relay them to the user directly
6. **Monitor `WHATSAPP_DISCONNECTED`** — this means the circuit breaker detected an outage. Inform the user and retry later
7. **Leverage async status** — use webhooks (`message.status`) to know when messages are delivered/read
8. **Monitor MCP logs** for `CONNECTION_ERROR` and `TIMEOUT` to detect connectivity issues

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
