# API Reference

## REST Endpoints

Base URL: `http://localhost:3000`

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/sessions` | Create session |
| GET | `/v1/sessions` | List sessions |
| GET | `/v1/sessions/:id` | Get session |
| POST | `/v1/sessions/:id/connect` | Connect session |
| POST | `/v1/sessions/:id/disconnect` | Disconnect |
| DELETE | `/v1/sessions/:id` | Delete session |

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/messages/send` | Send text (supports `quotedMessageId` for replies) |
| POST | `/v1/messages/send-media` | Send media (`mediaBase64` or `mediaUrl`, max 5MB) |
| DELETE | `/v1/messages` | Delete message |

### Contacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/contacts/:sessionId` | List contacts |
| GET | `/v1/contacts/:sessionId/:jid` | Get contact |

### Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/groups/:sessionId/:groupId` | Get group |
| POST | `/v1/groups/:sessionId/:groupId/participants` | Manage participants |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/webhooks` | Create webhook |
| GET | `/v1/webhooks` | List webhooks |
| GET | `/v1/webhooks/:id` | Get webhook |
| PATCH | `/v1/webhooks/:id` | Update webhook |
| DELETE | `/v1/webhooks/:id` | Delete webhook |

### Conversation States

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/states/:sessionId/:jid` | Get state |
| PUT | `/v1/states/:sessionId/:jid` | Update state |
| DELETE | `/v1/states/:sessionId/:jid` | Clear state |
| GET | `/v1/states/:sessionId` | List states |

### Queues

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/queues/stats` | Queue stats |
| GET | `/v1/queues/failed` | Failed jobs |
| POST | `/v1/queues/failed/:queue/:id/retry` | Retry job |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/admin/api-keys` | Create API key |
| GET | `/v1/admin/api-keys` | List API keys |
| DELETE | `/v1/admin/api-keys/:id` | Revoke key |

### Health & Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/health/ready` | Readiness check |
| GET | `/metrics` | Prometheus metrics |

---

## Authentication

All `/v1/*` endpoints require API key:

```
X-API-Key: wsk_xxxxxxxxxxxxx
```

### Roles

| Role | Permissions |
|------|-------------|
| `viewer` | Read-only access |
| `operator` | Read + write (send messages, manage state) |
| `admin` | Full access (create/revoke API keys, manage users) |

> **MCP Proxy**: The MCP server authenticates to REST using an `operator`-role API key.
> See [MCP Architecture](MCP_ARCHITECTURE.md) for setup.

Skip auth in development mode (`NODE_ENV=development`).

---

## Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```
