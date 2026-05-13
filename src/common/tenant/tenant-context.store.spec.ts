import { TenantContextStore, TenantContext } from './tenant-context.store';

describe('TenantContextStore', () => {
  afterEach(() => {
    TenantContextStore.clear();
  });

  describe('set and get', () => {
    it('should store and retrieve tenant context', () => {
      const ctx: TenantContext = { tenantId: 'tenant-123', userId: 'user-456' };
      TenantContextStore.set(ctx);

      const retrieved = TenantContextStore.get();
      expect(retrieved).toEqual(ctx);
    });

    it('should return undefined when no context is set', () => {
      const retrieved = TenantContextStore.get();
      expect(retrieved).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear tenant context', () => {
      const ctx: TenantContext = { tenantId: 'tenant-123' };
      TenantContextStore.set(ctx);
      TenantContextStore.clear();

      const retrieved = TenantContextStore.get();
      expect(retrieved).toBeUndefined();
    });
  });

  describe('async isolation', () => {
    it('should isolate context between async operations', async () => {
      const ctx1: TenantContext = { tenantId: 'tenant-1' };
      const ctx2: TenantContext = { tenantId: 'tenant-2' };

      const promise1 = new Promise<void>((resolve) => {
        TenantContextStore.set(ctx1);
        setTimeout(() => {
          expect(TenantContextStore.get()).toEqual(ctx1);
          resolve();
        }, 50);
      });

      const promise2 = new Promise<void>((resolve) => {
        TenantContextStore.set(ctx2);
        setTimeout(() => {
          expect(TenantContextStore.get()).toEqual(ctx2);
          resolve();
        }, 50);
      });

      await Promise.all([promise1, promise2]);
    });
  });
});