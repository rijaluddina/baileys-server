import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaTenantMiddleware } from './prisma-tenant.middleware.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private pool: pg.Pool;
  private tenantMiddleware: PrismaTenantMiddleware;

  constructor() {
    const connectionString =
      process.env['DATABASE_URL'] ||
      'postgresql://baileys:baileys@localhost:5432/baileys_server';
    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({ adapter });
    this.pool = pool;
    this.tenantMiddleware = new PrismaTenantMiddleware();
  }

  async onModuleInit() {
    (this as any).use(async (params, next) => {
      return this.tenantMiddleware.execute(params, next);
    });
    await this.$connect();
    this.logger.log('PostgreSQL connected via Prisma');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('PostgreSQL disconnected');
  }
}
