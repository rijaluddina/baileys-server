# BaileysJS WhatsApp Server

WhatsApp server built on Bun runtime using BaileysJS.

## Prerequisites

- Bun >= 1.0
- PostgreSQL >= 14

## Setup

1. Install dependencies:
```bash
bun install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Run database migrations:
```bash
bun run db:generate
bun run db:migrate
```

4. Start the server:
```bash
bun run dev
```

## Project Structure

```
src/
├── adapters/           # External interfaces
│   ├── rest/           # REST API (Phase 3)
│   └── mcp/            # MCP wrapper (Phase 4)
├── core/               # Domain services
│   ├── auth/           # Auth state management
│   ├── baileys/        # Baileys wrapper
│   └── session/        # Session management
└── infrastructure/     # External dependencies
    ├── database/       # Drizzle ORM
    ├── events.ts       # Event bus
    └── logger.ts       # Pino logger
```

## API Endpoints

- `GET /health` - Health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
