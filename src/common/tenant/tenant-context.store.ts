import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

const store = new AsyncLocalStorage<TenantContext>();

export class TenantContextStore {
  static set(ctx: TenantContext): void {
    store.enterWith(ctx);
  }

  static get(): TenantContext | undefined {
    return store.getStore();
  }

  static clear(): void {
    store.enterWith(undefined as any);
  }
}