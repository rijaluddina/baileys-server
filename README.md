# BaileysJS WhatsApp Server

Production-grade WhatsApp server built on Bun runtime using BaileysJS.

## Features

- 🔌 Multi-session WhatsApp management
- 🤖 MCP tools for LangGraph agents (Proxy architecture)
- 📨 Message queues (BullMQ/Redis)
- 🔔 Webhooks with HMAC signing
- 📊 Prometheus metrics
- 🔐 Dual Authentication (API Key + JWT) with Hybrid SaaS (Independent Users + Manual Teams)
- 💾 Conversation state management
- 🛡️ Double-layer rate limiting (REST + MCP)
- ⚡ Circuit breaker for WhatsApp resilience (fast-fail on disconnect)
- 📬 Async message status tracking (queued → sent → delivered → read)
- 🗣️ LLM-friendly natural-language error translation

## Prerequisites

- Bun >= 1.0
- PostgreSQL >= 14
- Redis >= 6

## Quick Start

```bash
# Install
bun install

# Configure
cp .env.example .env

# Database
bun run db:generate
bun run db:migrate

# Run REST server (main process — manages WhatsApp connections)
bun run dev

# Run MCP server (separate process — proxies to REST API)
bun run mcp
```

## Architecture

```
┌──────────────────────────┐     ┌──────────────────────────┐
│   Dashboard UI (React)   │     │   LLM Agent (LangGraph)  │
└──────────┬───────────────┘     └──────────┬───────────────┘
           │ HTTP (JWT)                     │ stdio
           │                   ┌────────────▼──────────────┐
           │                   │   MCP Server (Proxy)      │
           │                   │   Rate Limiter → fetch()  │
           │                   │   Error → NL Translation  │
           │                   └────────────┬──────────────┘
           │                                │ HTTP + X-API-Key
           └─────────────┬──────────────────┘
                         ▼
           ┌─────────────────────────────┐
           │   REST API (bun start)      │
           │   Auth → Rate Limit → Core  │
           │   Circuit Breaker → Baileys │
           │   Status Tracking → DB      │
           └──────────┬──────────────────┘
                      ▼
           ┌─────────────────────────────┐
           │   WhatsApp (Baileys)        │
           │   Async: receipt → DB       │
           └─────────────────────────────┘
```

> **MCP-as-Proxy**: The MCP server does NOT import Core modules directly.
> It forwards all tool calls to the REST API via HTTP,
> so both processes share the same WhatsApp session.
>
> **Circuit Breaker**: When WhatsApp disconnects, the circuit breaker opens
> and immediately returns `503` without waiting for timeout. It auto-resets
> when the connection is restored.
>
> **Async Status**: Sent messages return `{ status: "queued" }` immediately.
> WhatsApp receipt events update the status in DB (delivered → read) asynchronously.

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API_REFERENCE.md) | REST endpoints & response format |
| [MCP Tools](docs/MCP_TOOLS.md) | MCP tool reference |
| [MCP Architecture](docs/MCP_ARCHITECTURE.md) | Proxy architecture, circuit breaker & deployment |
| [LangGraph Integration](docs/LANGGRAPH_INTEGRATION.md) | Agent integration guide |
| [Architecture Guide](docs/ARCHITECTURE.md) | System architecture & async flows |
| [Testing Strategy](docs/TESTING_STRATEGY.md) | Test categories & coverage |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/health` | Health check |
| `/metrics` | Prometheus metrics |
| `/v1/auth` | Authentication (Login & Signup) |
| `/v1/users` | Independent User Management |
| `/v1/organizations` | Manual Team Management |
| `/v1/sessions` | Session management |
| `/v1/messages` | Send messages (text, media via base64 or URL) |
| `/v1/contacts` | Contact lookup |
| `/v1/groups` | Group management |
| `/v1/presence` | Typing indicators |
| `/v1/webhooks` | Webhook management |
| `/v1/states` | Conversation state |
| `/v1/queues` | Queue management |
| `/v1/admin` | API key management |
| `/v1/events/sse` | Real-time events (SSE) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP port |
| `DATABASE_URL` | - | PostgreSQL URL |
| `REDIS_HOST` | localhost | Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `AUTO_CONNECT_SESSIONS` | false | Auto-connect on startup |
| `MCP_API_BASE_URL` | <http://localhost:3000> | REST API URL for MCP proxy |
| `MCP_API_KEY` | - | API key for MCP → REST auth |
| `MCP_RATE_LIMIT` | 30 | MCP-side rate limit (req/min) |

## Project Structure

```
src/
├── adapters/           # External interfaces
│   ├── rest/           # REST API (Hono)
│   │   ├── routes/     # Endpoint handlers
│   │   ├── auth.middleware.ts # Dual Auth & Multi-Tenancy Middleware
│   │   ├── rate-limiter.ts
│   │   └── security.ts
│   └── mcp/            # MCP server (Proxy)
│       ├── index.ts    # Tool definitions → REST proxy
│       ├── api-client.ts       # HTTP client to REST API
│       └── mcp-rate-limiter.ts # Double-layer rate limit
├── core/               # Domain services
│   ├── baileys/        # WhatsApp connection + CB sync
│   ├── auth/           # Identity, Accounts & Key Management
│   ├── session/        # Session management
│   ├── messaging/      # Message handling + status tracking
│   │   ├── messaging.service.ts       # Send text/media/forward
│   │   ├── message-status.service.ts  # DB status persistence
│   │   └── message-status.listener.ts # EventBus → DB bridge
│   ├── contact/        # Contact operations
│   ├── group/          # Group operations
│   ├── presence/       # Typing indicators
│   ├── webhook/        # Webhook delivery
│   └── conversation/   # State management
└── infrastructure/     # External dependencies
    ├── database/       # Drizzle ORM + PostgreSQL (incl. sent_messages)
    ├── queue/          # BullMQ + Redis
    ├── metrics/        # Prometheus
    ├── resilience/     # Circuit breaker (whatsapp, database, redis)
    ├── errors/         # Error codes & AppError
    └── events.ts       # Typed event bus
```

## Testing

```bash
bun test                  # Run all tests (81 tests)
bun test tests/mcp        # MCP security, sanitization, proxy
bun test tests/parity     # REST-MCP parity
bun test tests/negative   # Forbidden tools, invalid params
```

## License

[BSD](License)
