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

type PrismaExtensionQueryArgs = {
  model?: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
};

function bindIfFunction(value: unknown, thisArg: object): unknown {
  return value instanceof Function ? value.bind(thisArg) : value;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private pool: pg.Pool;
  private tenantMiddleware: PrismaTenantMiddleware;
  private readonly client: object;

  constructor() {
    const connectionString =
      process.env['DATABASE_URL'] ||
      'postgresql://baileys:baileys@localhost:5432/baileys_server';
    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({ adapter });
    this.pool = pool;
    this.tenantMiddleware = new PrismaTenantMiddleware();
    const tenantMiddleware = this.tenantMiddleware;

    this.client = this.$extends({
      query: {
        $allModels: {
          $allOperations({
            model,
            operation,
            args,
            query,
          }: PrismaExtensionQueryArgs) {
            return tenantMiddleware.execute(
              {
                model: model ?? undefined,
                action: operation,
                args: args ?? {},
              },
              (params) => query(params.args),
            );
          },
        },
      },
    });

    return new Proxy(this, {
      get(target, property) {
        if (Reflect.has(target, property)) {
          const value = Reflect.get(target, property, target) as unknown;
          return bindIfFunction(value, target);
        }

        const value = Reflect.get(
          target.client,
          property,
          target.client,
        ) as unknown;
        return bindIfFunction(value, target.client);
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('PostgreSQL connected via Prisma');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('PostgreSQL disconnected');
  }
}
