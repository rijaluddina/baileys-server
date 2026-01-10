#!/bin/sh
set -e

echo "Running database migrations..."
bun run db:migrate

echo "Starting server..."
exec bun run src/index.ts
