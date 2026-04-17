# MCP Tools Reference

> **Architecture**: MCP uses a Proxy model — all tools forward requests to the REST API.
> See [MCP Architecture](MCP_ARCHITECTURE.md) for details.

## Messaging Tools

### send_text_message

Send a text message to a WhatsApp contact or group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| to | string | ✓ | Recipient JID |
| text | string | ✓ | Message text |

**Proxied to:** `POST /v1/messages/send`

**Response:**
```json
{
  "status": "queued",
  "id": "ABCD1234",
  "to": "628xxx@s.whatsapp.net",
  "timestamp": 1704672000
}
```

> The message is queued for delivery. Actual delivery status (delivered/read)
> is tracked asynchronously via WhatsApp receipt events.

---

### send_image

Send an image to a WhatsApp contact or group (max 5MB).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| to | string | ✓ | Recipient JID |
| imageUrl | string (URL) | | URL of the image to send |
| imageBase64 | string | | Base64 encoded image data |
| caption | string | | Optional caption |

> Either `imageUrl` or `imageBase64` must be provided. The REST API handles URL downloading — MCP does not download media itself.

**Proxied to:** `POST /v1/messages/send-media`

---

### reply_message

Reply to a specific message.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| to | string | ✓ | Chat JID |
| text | string | ✓ | Reply text |
| quotedMessageId | string | ✓ | Message ID to reply to |

**Proxied to:** `POST /v1/messages/send`

---

## Contact Tools

### get_contact_profile

Get profile info for a contact.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| jid | string | ✓ | Contact JID |

**Proxied to:** `GET /v1/contacts/:jid?sessionId=`

---

### get_group_metadata

Get metadata for a WhatsApp group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| groupId | string | ✓ | Group JID |

**Proxied to:** `GET /v1/groups/:id?sessionId=`

---

## Presence Tools

### set_typing

Show typing indicator in a chat.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| jid | string | ✓ | Chat JID |
| duration | number | | Duration in ms (default 3000) |

**Proxied to:** `POST /v1/presence/:jid/typing?sessionId=`

---

## State Tools

### get_conversation_state

Get conversation state for a JID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| jid | string | ✓ | Chat JID |

**Proxied to:** `GET /v1/states/:sessionId/:jid`

**Response:**
```json
{
  "exists": true,
  "jid": "628xxx@s.whatsapp.net",
  "context": { "topic": "support" },
  "history": [
    { "role": "user", "content": "Hello", "timestamp": "..." }
  ],
  "version": 3
}
```

---

### update_conversation_state

Update conversation state.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| jid | string | ✓ | Chat JID |
| context | object | | Context to merge |
| agentId | string | | Agent identifier |
| ttlMinutes | number | | TTL for auto-expiry |

**Proxied to:** `PUT /v1/states/:sessionId/:jid`

---

### add_to_history

Add a message to conversation history.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| jid | string | ✓ | Chat JID |
| role | enum | ✓ | "user", "assistant", "system" |
| content | string | ✓ | Message content |

**Proxied to:** `PUT /v1/states/:sessionId/:jid`

---

### clear_conversation_state

Clear conversation state.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| jid | string | ✓ | Chat JID |

**Proxied to:** `DELETE /v1/states/:sessionId/:jid`

---

## Rate Limiting

MCP applies a **double-layer rate limit**:

| Layer | Default | Description |
|-------|---------|-------------|
| Layer 2 (MCP) | 30 req/min | Blocks before HTTP request is made |
| Layer 1 (REST) | 100 req/min | Blocks at the API server |

When rate limited at Layer 2, the MCP rate limiter returns:
```json
{
  "error": "Rate limit exceeded. Please slow down.",
  "code": "RATE_LIMITED",
  "retryAfterMs": 45000
}
```

## Error Handling

When the REST API returns an error, MCP translates it into a **natural-language message** that LLM agents can understand and relay to users:

| Error Code | LLM-Friendly Message |
|------------|---------------------|
| `WHATSAPP_DISCONNECTED` | "Failed to send. The WhatsApp connection is currently down. Please inform the user to try again later." |
| `SESSION_NOT_FOUND` | "WhatsApp session not found. Make sure the session has been created and is active." |
| `SESSION_NOT_CONNECTED` | "WhatsApp session is not connected yet. Ask the user to scan the QR code first." |
| `RATE_LIMITED` | "Rate limit reached. Please wait a moment before trying again." |
| `TIMEOUT` | "The request timed out. The WhatsApp server may be slow — please try again." |
| `CONNECTION_ERROR` | "Could not reach the WhatsApp server. Please check the service status and try again." |

> **Circuit Breaker**: When WhatsApp is disconnected, the REST API returns `503 WHATSAPP_DISCONNECTED`.
> MCP translates this to a human-readable message so the LLM agent can inform the user.

## Security

### Feature Flag Service (Flexible Allowlist/Denylist)

MCP devices are dynamically registered using the Feature Flag Service (`src/core/config/feature-flag.service.ts`). This allows administrators to granularly block or allow each device for security and freezes.

These settings can be used programmatically during initialization:
```ts
import { featureFlagService } from "@core/config/feature-flag.service";

// Disable a specific tool
featureFlagService.setFlag("mcp:tool:clear_conversation_state", false);
```

### Allowlisted Tools (10)

Only these tools are registered in the MCP server. Everything else is denied.

### Denied Tools (explicit)

| Tool | Reason |
|------|--------|
| `delete_session` | Destructive — admin only |
| `create_session` | Admin operation |
| `list_all_sessions` | Information leak |
| `modify_credentials` | Security risk |
| `export_auth_state` | Credential theft |
| `import_auth_state` | Session hijacking |
| `raw_socket_access` | Full Baileys access |
| `execute_raw_command` | Arbitrary execution |
| `revoke_api_key` | Privilege escalation |
