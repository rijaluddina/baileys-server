# BaileysJS WhatsApp Server

Production-grade WhatsApp server built on Bun runtime using BaileysJS.

## Features

- 🔌 Multi-session WhatsApp management
- 🤖 MCP tools for LangGraph agents
- 📨 Message queues (BullMQ/Redis)
- 🔔 Webhooks with HMAC signing
- 📊 Prometheus metrics
- 🔐 API key authentication
- 💾 Conversation state management

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

# Run
bun run dev        # REST server
bun run mcp        # MCP server (stdio)
```

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API_REFERENCE.md) | REST endpoints |
| [MCP Tools](docs/MCP_TOOLS.md) | MCP tool reference |
| [LangGraph Integration](docs/LANGGRAPH_INTEGRATION.md) | Agent integration guide |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/health` | Health check |
| `/metrics` | Prometheus metrics |
| `/v1/sessions` | Session management |
| `/v1/messages` | Send messages |
| `/v1/webhooks` | Webhook management |
| `/v1/states` | Conversation state |
| `/v1/queues` | Queue management |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP port |
| `DATABASE_URL` | - | PostgreSQL URL |
| `REDIS_HOST` | localhost | Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `AUTO_CONNECT_SESSIONS` | false | Auto-connect on startup |

## Project Structure

```
src/
├── adapters/           # External interfaces
│   ├── rest/           # REST API
│   └── mcp/            # MCP server
├── core/               # Domain services
│   ├── baileys/        # WhatsApp connection
│   ├── session/        # Session management
│   ├── webhook/        # Webhook delivery
│   └── conversation/   # State management
└── infrastructure/     # External dependencies
    ├── database/       # Drizzle ORM
    ├── queue/          # BullMQ
    ├── metrics/        # Prometheus
    └── events.ts       # Event bus
```
