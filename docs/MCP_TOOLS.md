# MCP Tools Reference

## Messaging Tools

### send_text_message

Send a text message to a WhatsApp contact or group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| to | string | ✓ | Recipient JID |
| text | string | ✓ | Message text |

**Response:**
```json
{
  "success": true,
  "messageId": "ABCD1234",
  "to": "628xxx@s.whatsapp.net",
  "timestamp": 1704672000
}
```

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

---

## Contact Tools

### get_contact_profile

Get profile info for a contact.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| jid | string | ✓ | Contact JID |

---

### get_group_metadata

Get metadata for a WhatsApp group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| groupId | string | ✓ | Group JID |

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

---

## State Tools

### get_conversation_state

Get conversation state for a JID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| jid | string | ✓ | Chat JID |

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

---

### clear_conversation_state

Clear conversation state.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | ✓ | Session ID |
| jid | string | ✓ | Chat JID |
