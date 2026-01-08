# LangGraph Agent Integration Guide

## Overview

This server provides MCP (Model Context Protocol) tools for LangGraph agents to interact with WhatsApp.

## Architecture

```
LangGraph Agent  →  MCP Tools  →  Core Services  →  WhatsApp (Baileys)
       ↑                                    ↓
       └─────────── Events ←───────────────┘
```

## MCP Tools

### Messaging

| Tool | Description |
|------|-------------|
| `send_text_message` | Send text message |
| `reply_message` | Reply to a message |

### Contacts & Groups

| Tool | Description |
|------|-------------|
| `get_contact_profile` | Get contact info |
| `get_group_metadata` | Get group info |

### Presence

| Tool | Description |
|------|-------------|
| `set_typing` | Show typing indicator |

### Conversation State

| Tool | Description |
|------|-------------|
| `get_conversation_state` | Get state for JID |
| `update_conversation_state` | Update context |
| `add_to_history` | Add to history |
| `clear_conversation_state` | Clear state |

---

## Tool Response Format

All tools return JSON in this format:

**Success:**
```json
{
  "success": true,
  "messageId": "...",
  ...
}
```

**Error:**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `SESSION_NOT_FOUND` | Session ID invalid |
| `SESSION_NOT_CONNECTED` | Session disconnected |
| `SEND_FAILED` | Message send failed |
| `REPLY_FAILED` | Reply failed |
| `PROFILE_FETCH_FAILED` | Profile fetch failed |
| `GROUP_FETCH_FAILED` | Group fetch failed |
| `TYPING_FAILED` | Typing indicator failed |

---

## Example Agent Flow

```python
# 1. Receive message event (via Redis Pub/Sub or webhook)
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

1. **Always check session connection** before sending
2. **Use typing indicators** for natural feel  
3. **Persist state** for multi-turn conversations
4. **Set TTL** on state to auto-cleanup
5. **Handle errors gracefully** - retry on transient failures

---

## MCP Resources

| Resource | Description |
|----------|-------------|
| `state://{sessionId}/{jid}` | Conversation state |
| `contacts://{sessionId}/list` | Contact list |
| `groups://{sessionId}/list` | Group list |

---

## Event Types

Subscribe via webhooks or Redis Pub/Sub:

| Event | Description |
|-------|-------------|
| `message.received` | New message |
| `message.sent` | Message sent |
| `message.status` | Delivery status |
| `connection.open` | Connected |
| `connection.close` | Disconnected |
| `qr.update` | QR code update |
