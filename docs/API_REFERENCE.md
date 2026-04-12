# API Reference

## REST Endpoints

Base URL: `http://localhost:3000`

### Authentication & Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/auth/login` | Login and get JWT Token |
| POST | `/v1/users` | Create user (owner only) |
| GET | `/v1/users` | List users in organization |
| GET | `/v1/users/:id` | Get user |
| PATCH | `/v1/users/:id` | Update user |
| DELETE | `/v1/users/:id` | Delete user |

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

### Admin & Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/admin/api-keys` | Create API key |
| GET | `/v1/admin/api-keys` | List API keys |
| GET | `/v1/admin/api-keys/:id` | Get single API key |
| PATCH | `/v1/admin/api-keys/:id` | Update API key properties |
| POST | `/v1/admin/api-keys/:id/rotate` | Rotate API key (Grace period supported) |
| DELETE | `/v1/admin/api-keys/:id` | Revoke key |
| GET | `/v1/admin/me` | Get current key/user context |

### Health & Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/health/ready` | Readiness check |
| GET | `/metrics` | Prometheus metrics |

---

## Authentication & Multi-Tenancy

The API supports **Dual Authentication** and maps requests mapping to Isolated **Organizations**.

### Dual-Auth Mechanism

You can hit the API using either an **API Key** (for programmatic, machine-to-machine M2M integration), or a **JWT Token** (for Dashboard User interactions).

- **API Key**: Ensure you pass the key under the `X-API-Key` headers.
```
X-API-Key: wsk_xxxxxxxxxxxxx
```

- **JWT Token**: Provide the issued session JWT inside the Authorization Header.
```
Authorization: Bearer <your-jwt-token>
```

### Roles & Access Matrix

Data access is strict and tied to the `organization_id` property of the invoking token/key.

| Role | Permissions | Available Features |
|------|-------------|--------------------|
| `viewer` | Read-only | List data (sessions, chats, contacts) only. |
| `operator` | Operating | Plus messaging control (Send, Handle States, Sessions Connect). |
| `admin` | Organization | Plus provisioning capability (Key Creation, Webhooks configs). |
| `owner` | Ownership | Plus total tenant management (Users CRUD, Global Configurations). |

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
