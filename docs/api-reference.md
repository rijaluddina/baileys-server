# Baileys WhatsApp API Documentation

## Overview

Base URL: `http://localhost:3000/api`

Authentication: All endpoints require `x-api-key` header.

---

## Health

### GET /health
Service health check.

**Response:**
```json
{ "status": "ok", "service": "baileys-server" }
```

---

## Sessions

### POST /sessions
Create a new WhatsApp session.

**Request:**
```json
{
  "name": "my-session"
}
```

**Response:**
```json
{
  "sessionId": "abc123",
  "status": "created"
}
```

### GET /sessions
List all sessions for tenant.

### GET /sessions/:sessionId
Get session details.

### DELETE /sessions/:sessionId
Delete a session.

### POST /sessions/:sessionId/connect
Start QR code authentication.

**Response:**
```json
{
  "qr": "data:image/png;base64,..."
}
```

### GET /sessions/:sessionId/qr
Get current QR code.

### POST /sessions/:sessionId/pairing-code
Request pairing code.

### POST /sessions/:sessionId/disconnect
Disconnect session.

### POST /sessions/:sessionId/reconnect
Reconnect session.

---

## Messaging

### POST /sessions/:sessionId/messages
Send a message.

**Request:**
```json
{
  "to": "6281234567890@s.whatsapp.net",
  "content": {
    "text": "Hello!"
  }
}
```

### GET /sessions/:sessionId/messages
Get message history.

### DELETE /sessions/:sessionId/messages/:messageId
Delete message for everyone.

### DELETE /sessions/:sessionId/messages/:messageId/me
Delete message for me.

### POST /sessions/:sessionId/messages/react
React to a message.

**Request:**
```json
{
  "jid": "6281234567890@s.whatsapp.net",
  "key": {
    "id": "message-id"
  },
  "reaction": {
    "text": "👍"
  }
}
```

---

## Groups

### POST /sessions/:sessionId/groups
Create a group.

### GET /sessions/:sessionId/groups
List groups.

### GET /sessions/:sessionId/groups/:groupJid
Get group info.

### PATCH /sessions/:sessionId/groups/:groupJid
Update group (name, description, settings).

### DELETE /sessions/:sessionId/groups/:groupJid
Delete group.

### POST /sessions/:sessionId/groups/:groupJid/participants
Add participants.

### DELETE /sessions/:sessionId/groups/:groupJid/participants
Remove participants.

### POST /sessions/:sessionId/groups/:groupJid/invite-code
Get group invite code.

### POST /sessions/:sessionId/groups/:groupJid/revoke-invite-code
Revoke invite code.

### POST /sessions/:sessionId/groups/:groupJid/join
Join group via invite code.

---

## Chats

### GET /sessions/:sessionId/chats
List all chats.

### PATCH /sessions/:sessionId/chats/:chatJid
Update chat (archive, pin, mute).

### DELETE /sessions/:sessionId/chats/:chatJid
Delete chat.

### POST /sessions/:sessionId/chats/:chatJid/mark-read
Mark chat as read.

---

## Contacts

### GET /sessions/:sessionId/contacts
List contacts.

### GET /sessions/:sessionId/contacts/:contactJid
Get contact profile.

### POST /sessions/:sessionId/contacts/check
Check if numbers exist on WhatsApp.

### GET /sessions/:sessionId/contacts/:contactJid/avatar
Get contact avatar.

### POST /sessions/:sessionId/contacts/:contactJid/block
Block contact.

### DELETE /sessions/:sessionId/contacts/:contactJid/block
Unblock contact.

---

## Misc

### POST /sessions/:sessionId/presence
Set presence (composing, recording, etc.).

### POST /sessions/:sessionId/presence/subscribe
Subscribe to presence updates.

### GET /sessions/:sessionId/labels
Get labels.

### POST /sessions/:sessionId/labels/chat/:jid/:labelId/add
Add label to chat.

### POST /sessions/:sessionId/labels/chat/:jid/:labelId/remove
Remove label from chat.

### POST /sessions/:sessionId/labels/message/:jid/:messageId/:labelId/add
Add label to message.

### POST /sessions/:sessionId/labels/message/:jid/:messageId/:labelId/remove
Remove label from message.

### GET /sessions/:sessionId/privacy
Get privacy settings.

### POST /sessions/:sessionId/privacy/last-seen
Update last-seen privacy.

### POST /sessions/:sessionId/privacy/online
Update online status privacy.

### POST /sessions/:sessionId/privacy/profile-picture
Update profile picture privacy.

### POST /sessions/:sessionId/privacy/status
Update status privacy.

### POST /sessions/:sessionId/privacy/read-receipts
Update read receipts privacy.

### POST /sessions/:sessionId/privacy/groups
Update groups add privacy.

### GET /sessions/:sessionId/blocklist
Get blocklist.

### GET /sessions/:sessionId/device
Get connected device info.

---

## Newsletters (Channels)

### POST /sessions/:sessionId/newsletters
Create newsletter.

### GET /sessions/:sessionId/newsletters/:newsletterJid
Get newsletter info.

### GET /sessions/:sessionId/newsletters/:newsletterJid/subscribers
Get subscriber count.

### GET /sessions/:sessionId/newsletters/:newsletterJid/messages
Fetch newsletter messages.

### POST /sessions/:sessionId/newsletters/follow
Follow newsletter.

### POST /sessions/:sessionId/newsletters/unfollow
Unfollow newsletter.

### POST /sessions/:sessionId/newsletters/mute
Mute newsletter.

### POST /sessions/:sessionId/newsletters/unmute
Unmute newsletter.

### POST /sessions/:sessionId/newsletters/send
Send message to newsletter.

### DELETE /sessions/:sessionId/newsletters/:newsletterJid
Delete newsletter.

### POST /sessions/:sessionId/newsletters/:newsletterJid/name
Update newsletter name.

### POST /sessions/:sessionId/newsletters/:newsletterJid/description
Update newsletter description.

### POST /sessions/:sessionId/newsletters/:newsletterJid/react
React to newsletter message.

---

## Media Upload

### POST /sessions/:sessionId/media/upload/init
Initiate presigned URL upload.

**Request:**
```json
{
  "filename": "image.jpg",
  "mimeType": "image/jpeg",
  "size": 1024000
}
```

**Response:**
```json
{
  "uploadId": "abc123",
  "presignedUrl": "https://s3.../upload?signature=...",
  "expiresAt": "2024-01-01T00:00:00Z"
}
```

### POST /sessions/:sessionId/media/upload/:id/complete
Complete presigned URL upload.

### POST /sessions/:sessionId/media
Stream upload a file (multipart).

---

## Webhooks

### GET /sessions/:sessionId/webhooks
List webhooks.

### POST /sessions/:sessionId/webhooks
Create webhook.

### GET /sessions/:sessionId/webhooks/:webhookId
Get webhook details.

### PATCH /sessions/:sessionId/webhooks/:webhookId
Update webhook.

### DELETE /sessions/:sessionId/webhooks/:webhookId
Delete webhook.

### POST /sessions/:sessionId/webhooks/:webhookId/test
Test webhook delivery.

---

## Tenant Management

### GET /tenants
List all tenants (admin).

### POST /tenants
Create a new tenant.

### GET /tenants/:id
Get tenant by ID.

### PATCH /tenants/:id
Update tenant.

### DELETE /tenants/:id
Delete tenant.

---

## Auth Keys

### GET /auth/keys
List all API keys for current tenant.

**Response:**
```json
[
  {
    "id": "key-123",
    "name": "Production Key",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "expiresAt": null,
    "lastUsedAt": "2024-01-01T00:00:00Z"
  }
]
```

### POST /auth/keys/rotate/:id
Rotate an API key (deactivate old, create new).

### POST /auth/keys/deactivate/:id
Deactivate an API key.

### POST /auth/keys/activate/:id
Activate a deactivated API key.

---

## Capabilities

### GET /capabilities/:sessionId
Get all capabilities for a session.

**Response:**
```json
["send_message", "receive_message", "send_media", "view_chats"]
```

### GET /capabilities/:sessionId/:capabilityName
Check if session has a capability.

**Response:**
```json
{ "hasCapability": true }
```

### POST /capabilities/:sessionId/:capabilityName
Enable a capability for a session.

### DELETE /capabilities/:sessionId/:capabilityName
Disable a capability for a session.

---

## Admin

### GET /admin/tenants
Get all tenants with details.

### GET /admin/sessions
Get all sessions (optionally filtered by tenant).

### GET /admin/metrics
Get system metrics.

**Response:**
```json
{
  "tenants": { "total": 5, "active": 4 },
  "sessions": { "total": 20, "connected": 15 },
  "queues": { "message:send": { "waiting": 5, "active": 2 } }
}
```

---

## Webhook Events

Events delivered to your webhook URL:

| Event | Description |
|-------|-------------|
| `session.connected` | Session connected to WhatsApp |
| `session.disconnected` | Session disconnected |
| `session.qr.updated` | New QR code generated |
| `messages.upsert` | New message received |
| `messages.update` | Message updated |
| `messages.delete` | Message deleted |
| `chats.upsert` | New chat created |
| `chats.update` | Chat updated |
| `chats.delete` | Chat deleted |
| `contacts.upsert` | Contact info updated |
| `groups.upsert` | New group created |
| `groups.update` | Group updated |
| `groups.participantsUpdate` | Group participants changed |

---

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_FAILED` | Authentication failed |
| `SESSION_NOT_FOUND` | Session does not exist |
| `SESSION_DISCONNECTED` | Session is not connected |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INVALID_RECIPIENT` | Recipient not valid |
| `MESSAGE_TOO_LARGE` | Media/content exceeds limits |
| `NOT_ACCEPTED` | Operation not accepted by WhatsApp |
| `CONTENT_TOO_LONG` | Message content too long |
| `PAYLOAD_TOO_LARGE` | Request payload too large |

---

## Rate Limits

- **Messages:** 60/minute per session (sustained), 10 in 10 seconds (burst)
- **API:** 120 requests/minute per API key
- **Media Upload:** 100 uploads/hour per tenant

---

## Message Content Types

### Text
```json
{ "text": "Hello world" }
```

### Image
```json
{
  "image": { "url": "https://..." }
}
```

### Audio
```json
{
  "audio": { "url": "https://..." }
}
```

### Video
```json
{
  "video": { "url": "https://..." }
}
```

### Document
```json
{
  "document": { "url": "https://...", "filename": "doc.pdf" }
}
```

### Sticker
```json
{
  "sticker": { "url": "https://..." }
}
```

### Location
```json
{
  "location": {
    "degreesLatitude": -6.2,
    "degreesLongitude": 106.8
  }
}
```

### Contact
```json
{
  "contact": {
    "fullName": "John Doe",
    "contacts": [{ "displayName": "John", "waId": "6281234567890" }]
  }
}
```

### Poll
```json
{
  "poll": {
    "name": "Favorite color?",
    "options": [{ "optionName": "Red" }, { "optionName": "Blue" }]
  }
}
```

### Buttons
```json
{
  "buttons": {
    "buttons": [{ "buttonId": "1", "buttonText": "Yes" }]
  }
}
```

### List
```json
{
  "list": {
    "title": "Choose option",
    "buttonText": "Select",
    "sections": [{ "title": "Section", "rows": [{ "title": "Option 1" }] }]
  }
}
```