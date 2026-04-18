FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build
RUN pnpm run build

# Production image
FROM node:22-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
# Copy Prisma schema
COPY prisma ./prisma
COPY prisma.config.ts ./
# Install prod deps and trigger prisma generate natively
RUN pnpm install --frozen-lockfile --prod --shamefully-hoist
RUN npx prisma generate


# Copy built app
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
