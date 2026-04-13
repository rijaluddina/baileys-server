# MCP Architecture — Proxy Model

## Overview

The MCP (Model Context Protocol) server uses a **Proxy architecture** where all tool calls are forwarded to the REST API via HTTP instead of directly importing Core modules.

```
┌──────────────────────────────────────┐
│         LLM Agent / LangGraph        │
│         (Any server / cloud)         │
└──────────────┬───────────────────────┘
               │ stdio (local) or SSH (remote)
┌──────────────▼───────────────────────┐
│         MCP Server (bun mcp)         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  McpRateLimiter (Layer 2)      │  │
│  │  30 req/min per MCP session    │  │
│  └──────────────┬─────────────────┘  │
│                 ▼                    │
│  ┌────────────────────────────────┐  │
│  │  McpApiClient                  │  │
│  │  fetch() + X-API-Key header    │  │
│  └──────────────┬─────────────────┘  │
└─────────────────┼────────────────────┘
                  │ HTTP (localhost or remote)
┌─────────────────▼────────────────────┐
│         REST API (bun start)         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Auth Middleware (Layer 1)     │  │
│  │  API Key + RBAC + Rate Limit   │  │
│  └──────────────┬─────────────────┘  │
│                 ▼                    │
│  ┌────────────────────────────────┐  │
│  │  Core Services                 │  │
│  │  Session → Baileys → WhatsApp  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## Why Proxy?

### Problem with All-in-One

Previously, MCP directly imported Core modules:

```typescript
// ❌ Old approach — broken with separate processes
import { sessionManager } from "@core/session/session.manager";
const session = await sessionManager.getSession(sessionId);
```

When `bun start` and `bun mcp` run as separate processes, they have **separate memory**. MCP could never access the WhatsApp sessions managed by the REST process.

### Solution: MCP-as-Proxy

Now, MCP calls the REST API:

```typescript
// ✅ New approach — works across processes and machines
import { McpApiClient } from "./api-client";
const client = new McpApiClient();
const result = await client.proxyPost("/v1/messages/send", { sessionId, to, text });
```

## Tool → REST Endpoint Mapping

| MCP Tool | Method | REST Endpoint |
|----------|--------|---------------|
| `send_text_message` | POST | `/v1/messages/send` |
| `send_image` | POST | `/v1/messages/send-media` |
| `reply_message` | POST | `/v1/messages/send` |
| `get_contact_profile` | GET | `/v1/contacts/:jid?sessionId=` |
| `get_group_metadata` | GET | `/v1/groups/:id?sessionId=` |
| `set_typing` | POST | `/v1/presence/:jid/typing?sessionId=` |
| `get_conversation_state` | GET | `/v1/states/:sessionId/:jid` |
| `update_conversation_state` | PUT | `/v1/states/:sessionId/:jid` |
| `add_to_history` | PUT | `/v1/states/:sessionId/:jid` |
| `clear_conversation_state` | DELETE | `/v1/states/:sessionId/:jid` |

## Double-Layer Rate Limiting

| Layer | Location | Default Limit | Purpose |
|-------|----------|---------------|---------|
| **Layer 1** (REST) | `rate-limiter.ts` | 100 req/min + 10 burst/sec | Protects REST API from all clients |
| **Layer 2** (MCP) | `mcp-rate-limiter.ts` | 30 req/min | Blocks rogue LLM agents before HTTP call |

If the LLM agent exceeds 30 requests/minute, it gets blocked at Layer 2 **immediately** — the request never reaches the REST server.

## Circuit Breaker

The REST API wraps all WhatsApp calls with a circuit breaker (`breakers.whatsapp`):

```
LLM → MCP → REST → CircuitBreaker → Baileys → WhatsApp
                        │
                   ┌────┴─────────────────────┐
                   │  5 failures → OPEN   │
                   │  60s timeout → TEST  │
                   │  1 success → CLOSED  │
                   └──────────────────────────┘
```

| State | Behavior |
|-------|----------|
| `CLOSED` | Normal operation — requests pass through |
| `OPEN` | Fast-fail — returns `503 WHATSAPP_DISCONNECTED` immediately |
| `HALF_OPEN` | Testing — allows 1 request to check recovery |

The breaker auto-resets to `CLOSED` when a WhatsApp connection opens (`connection.open` event).

## LLM Error Translation

The MCP API client translates technical error codes into **natural-language messages** that LLM agents can relay to users:

```
REST Response:  { "error": { "code": "WHATSAPP_DISCONNECTED" } }
                        │
                  translateErrorForLLM()
                        │
MCP Tool Result: "Failed to send. The WhatsApp connection is
                  currently down. Please inform the user to
                  try again later."
```

| Error Code | LLM Message |
|------------|-------------|
| `WHATSAPP_DISCONNECTED` | Failed to send. The WhatsApp connection is currently down. Please inform the user to try again later. |
| `SESSION_NOT_CONNECTED` | WhatsApp session is not connected yet. Ask the user to scan the QR code first. |
| `RATE_LIMITED` | Rate limit reached. Please wait a moment before trying again. |
| `TIMEOUT` | The request timed out. The WhatsApp server may be slow — please try again. |
| `CONNECTION_ERROR` | Could not reach the WhatsApp server. Please check the service status and try again. |

## Configuration

```env
# Target REST API server
MCP_API_BASE_URL=http://localhost:3000

# API key for MCP → REST authentication (role: operator)
MCP_API_KEY=wsk_xxxxxxxxxxxx

# MCP-side rate limit (requests per minute)
MCP_RATE_LIMIT=30
```

## Deployment Scenarios

### 1. Same Machine (Default)

```bash
# Terminal 1: REST API
bun run dev

# Terminal 2: MCP Server
MCP_API_BASE_URL=http://localhost:3000 MCP_API_KEY=wsk_xxx bun run mcp
```

### 2. Different Machines (via SSH)

Agent server connects to MCP via SSH:

```bash
# From agent server, run MCP on the Baileys server
ssh user@baileys-server "cd /app && MCP_API_KEY=wsk_xxx bun run mcp"
```

### 3. Different Machines (Remote REST)

MCP runs locally on the agent server, pointing to remote REST:

```bash
# On agent server
MCP_API_BASE_URL=https://api.yourdomain.com MCP_API_KEY=wsk_xxx bun run mcp
```

> **Security Note**: When exposing REST API to the internet, always use HTTPS and a strong API key.

## Creating an MCP API Key

The MCP server needs an API key with `operator` role to authenticate with the REST API:

```bash
# Create key via admin endpoint
curl -X POST http://localhost:3000/v1/admin/api-keys \
  -H "X-API-Key: <admin-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mcp-proxy",
    "role": "operator",
    "rateLimit": 30
  }'

# Response contains the key (shown only once):
# { "data": { "key": "wsk_xxxxx", "id": "...", "role": "operator" } }
```

Set this key as `MCP_API_KEY` in the MCP server's environment.

## File Structure

```
src/adapters/mcp/
├── index.ts              # MCP server — tool definitions, proxy handlers
├── api-client.ts         # HTTP client + error translation for LLM
└── mcp-rate-limiter.ts   # Layer 2 rate limiter (in-process)
```
