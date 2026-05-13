import { Injectable, Logger } from '@nestjs/common';

interface MiddlewareParams {
  model?: string;
  action: string;
  args: Record<string, unknown>;
}

const TENANT_SCOPED_MODELS = [
  'Message',
  'Contact',
  'Chat',
  'Group',
  'Webhook',
  'WebhookLog',
  'SessionEvent',
  'AuditLog',
  'AuthCredential',
];

const EXCLUDED_MODELS = ['Session', 'IdempotencyKey', 'SystemConfig'];

function isTenantScoped(modelName: string): boolean {
  return TENANT_SCOPED_MODELS.includes(modelName);
}

function getTenantIdFromParams(params: MiddlewareParams): string | undefined {
  return params.args?.tenantId as string | undefined;
}

@Injectable()
export class PrismaTenantMiddleware {
  private readonly logger = new Logger(PrismaTenantMiddleware.name);

  constructor() {}

  async execute(
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => Promise<unknown>,
  ): Promise<unknown> {
    const { model, action, args } = params;

    if (!model) {
      return next(params);
    }

    if (EXCLUDED_MODELS.includes(model)) {
      return next(params);
    }

    if (!isTenantScoped(model)) {
      return next(params);
    }

    const tenantId = getTenantIdFromParams(params);

    if (!tenantId) {
      this.logger.warn(`Missing tenantId for ${model}.${action}`);
      return next(params);
    }

    const modifiedArgs = { ...args };

    switch (action) {
      case 'findMany':
      case 'findFirst':
      case 'findFirstOrThrow':
      case 'findUnique':
      case 'findUniqueOrThrow':
      case 'count':
      case 'aggregate':
      case 'groupBy': {
        if (modifiedArgs.where) {
          modifiedArgs.where = {
            ...(modifiedArgs.where as object),
            tenantId,
          };
        } else {
          modifiedArgs.where = { tenantId };
        }
        break;
      }

      case 'create': {
        if (modifiedArgs.data) {
          const data = modifiedArgs.data as Record<string, unknown>;
          delete data.tenantId;
          modifiedArgs.data = { ...data, tenantId };
        }
        break;
      }

      case 'createMany': {
        if (modifiedArgs.data && Array.isArray(modifiedArgs.data)) {
          modifiedArgs.data = (modifiedArgs.data as Record<string, unknown>[]).map(
            (item) => {
              const sanitized = { ...item };
              delete sanitized.tenantId;
              return { ...sanitized, tenantId };
            },
          );
        }
        break;
      }

      case 'update': {
        if (modifiedArgs.where) {
          modifiedArgs.where = {
            ...(modifiedArgs.where as object),
            tenantId,
          };
        } else {
          modifiedArgs.where = { tenantId };
        }

        if (modifiedArgs.data) {
          const data = modifiedArgs.data as Record<string, unknown>;
          delete data.tenantId;
          modifiedArgs.data = { ...data };
        }
        break;
      }

      case 'updateMany': {
        if (modifiedArgs.where) {
          modifiedArgs.where = {
            ...(modifiedArgs.where as object),
            tenantId,
          };
        } else {
          modifiedArgs.where = { tenantId };
        }
        break;
      }

      case 'delete': {
        if (modifiedArgs.where) {
          modifiedArgs.where = {
            ...(modifiedArgs.where as object),
            tenantId,
          };
        } else {
          modifiedArgs.where = { tenantId };
        }
        break;
      }

      case 'deleteMany': {
        if (modifiedArgs.where) {
          modifiedArgs.where = {
            ...(modifiedArgs.where as object),
            tenantId,
          };
        } else {
          modifiedArgs.where = { tenantId };
        }
        break;
      }

      case 'upsert': {
        if (modifiedArgs.where) {
          modifiedArgs.where = {
            ...(modifiedArgs.where as object),
            tenantId,
          };
        } else {
          modifiedArgs.where = { tenantId };
        }

        if (modifiedArgs.create) {
          const create = modifiedArgs.create as Record<string, unknown>;
          delete create.tenantId;
          modifiedArgs.create = { ...create, tenantId };
        }

        if (modifiedArgs.update) {
          const update = modifiedArgs.update as Record<string, unknown>;
          delete update.tenantId;
          modifiedArgs.update = { ...update };
        }
        break;
      }

      default:
        break;
    }

    return next({
      ...params,
      args: modifiedArgs,
    });
  }
}