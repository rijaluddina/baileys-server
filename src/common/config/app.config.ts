import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  environment: process.env.NODE_ENV ?? 'development',
  apiPrefix: process.env.API_PREFIX ?? 'api',
  host: process.env.HOST ?? '0.0.0.0',
  shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT ?? '30000', 10),
  cors: {
    enabled: process.env.CORS_ENABLED !== 'false',
    origins: process.env.CORS_ORIGINS?.split(',').filter(Boolean) ?? ['*'],
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },
  rateLimiting: {
    messageSend: {
      windowMs: parseInt(process.env.RATE_LIMIT_MSG_WINDOW ?? '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_MSG_MAX ?? '60', 10),
    },
    webhookDelivery: {
      windowMs: parseInt(process.env.RATE_LIMIT_WEBHOOK_WINDOW ?? '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_WEBHOOK_MAX ?? '30', 10),
    },
  },
  webhook: {
    globalUrl: process.env.WEBHOOK_URL ?? null,
    globalSecret: process.env.WEBHOOK_SECRET ?? null,
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT ?? '30000', 10),
  },
  session: {
    maxRetries: parseInt(process.env.SESSION_MAX_RETRIES ?? '5', 10),
    reconnectBaseDelay: parseInt(
      process.env.SESSION_RECONNECT_BASE_DELAY ?? '1000',
      10,
    ),
    reconnectMaxDelay: parseInt(
      process.env.SESSION_RECONNECT_MAX_DELAY ?? '30000',
      10,
    ),
    seenMessagesMax: parseInt(
      process.env.SESSION_SEEN_MESSAGES_MAX ?? '10000',
      10,
    ),
    heartbeatInterval: parseInt(
      process.env.SESSION_HEARTBEAT_INTERVAL ?? '10000',
      10,
    ),
    lockTtl: parseInt(process.env.SESSION_LOCK_TTL ?? '30000', 10),
  },
  cleanup: {
    messageRetentionDays: parseInt(
      process.env.MESSAGE_RETENTION_DAYS ?? '30',
      10,
    ),
    sessionEventRetentionDays: parseInt(
      process.env.SESSION_EVENT_RETENTION_DAYS ?? '7',
      10,
    ),
    auditLogRetentionDays: parseInt(
      process.env.AUDIT_LOG_RETENTION_DAYS ?? '90',
      10,
    ),
  },
}));
