# Stage 1: Base
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Stage 2: Dependencies
FROM base AS install
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Stage 3: Builder
FROM base AS builder
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate && bun run build

# Stage 4: Production
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json .

# Bun is already on PATH in oven/bun image
EXPOSE 3000

# Run migrations and then start
CMD ["sh", "-c", "bunx prisma migrate deploy && bun dist/src/main.js"]
