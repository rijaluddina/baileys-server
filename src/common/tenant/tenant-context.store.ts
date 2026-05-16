import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

const store = new AsyncLocalStorage<TenantContext>();
let storageInstance: AsyncLocalStorage<TenantContext> = store;

export class TenantContextStore {
  static set(ctx: TenantContext): void {
    storageInstance.enterWith(ctx);
  }

  static get(): TenantContext | undefined {
    const ctx = storageInstance.getStore();
    if (ctx && ctx.tenantId === '') {
      return undefined;
    }
    return ctx;
  }

  static clear(): void {
    storageInstance = new AsyncLocalStorage<TenantContext>();
  }

  static isEmpty(): boolean {
    const ctx = storageInstance.getStore();
    return !ctx || !ctx.tenantId;
  }
}
