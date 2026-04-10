# =============================================================================
# Multi-stage Dockerfile for WhatsApp Server
#
# Targets:
#   - rest  (default) → REST API server + Baileys core
#   - mcp             → MCP proxy server (lightweight, no Baileys)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Install dependencies
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 2: Build (type check)
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy deps
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Type check
RUN bun run --bun tsc --noEmit

# -----------------------------------------------------------------------------
# Stage 3a: REST API Server (default)
# -----------------------------------------------------------------------------
FROM oven/bun:1-slim AS rest

WORKDIR /app

# Don't run as root
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs whatsapp
USER whatsapp

# Copy application
COPY --from=builder --chown=whatsapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=whatsapp:nodejs /app/src ./src
COPY --from=builder --chown=whatsapp:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=whatsapp:nodejs /app/package.json ./
COPY --from=builder --chown=whatsapp:nodejs /app/drizzle.config.ts ./
COPY --from=builder --chown=whatsapp:nodejs /app/tsconfig.json ./
COPY --from=builder --chown=whatsapp:nodejs /app/docker-entrypoint.sh ./

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check (bun:1-slim does not have curl)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD bun -e "const r = await fetch('http://localhost:3000/health'); process.exit(r.ok ? 0 : 1)" || exit 1

# Start with entrypoint (runs migrations first)
CMD ["sh", "docker-entrypoint.sh"]

# -----------------------------------------------------------------------------
# Stage 3b: MCP Proxy Server
# -----------------------------------------------------------------------------
FROM oven/bun:1-slim AS mcp

WORKDIR /app

# Don't run as root
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs whatsapp
USER whatsapp

# Copy only what MCP needs (no drizzle, no migrations)
COPY --from=builder --chown=whatsapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=whatsapp:nodejs /app/src/adapters/mcp ./src/adapters/mcp
COPY --from=builder --chown=whatsapp:nodejs /app/src/infrastructure/logger.ts ./src/infrastructure/logger.ts
COPY --from=builder --chown=whatsapp:nodejs /app/src/mcp.ts ./src/mcp.ts
COPY --from=builder --chown=whatsapp:nodejs /app/package.json ./
COPY --from=builder --chown=whatsapp:nodejs /app/tsconfig.json ./

# Environment
ENV NODE_ENV=production
ENV MCP_API_BASE_URL=http://app:3000
ENV MCP_API_KEY=
ENV MCP_RATE_LIMIT=30

# MCP uses stdio transport — no port to expose
# No health check needed (stdio lifecycle managed by the agent)

CMD ["bun", "run", "src/mcp.ts"]
