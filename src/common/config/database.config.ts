import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  poolSize: parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT ?? '10000', 10),
  ssl: process.env.DB_SSL === 'true',
  sslMode: process.env.DB_SSL_MODE ?? 'prefer',
  logging: process.env.DB_LOGGING === 'true',
  maxQueryTimeout: parseInt(process.env.DB_MAX_QUERY_TIMEOUT ?? '30000', 10),
}));
