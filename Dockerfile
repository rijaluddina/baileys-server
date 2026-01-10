# =============================================================================
# Multi-stage Dockerfile for WhatsApp Server
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
# Stage 2: Build
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy deps
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Type check
RUN bun run --bun tsc --noEmit

# -----------------------------------------------------------------------------
# Stage 3: Production
# -----------------------------------------------------------------------------
FROM oven/bun:1-slim AS runner

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

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start with entrypoint (runs migrations first)
CMD ["sh", "docker-entrypoint.sh"]
