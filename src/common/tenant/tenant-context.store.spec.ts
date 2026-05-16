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

      const results: string[] = [];

      const promise1 = new Promise<void>((resolve) => {
        TenantContextStore.set(ctx1);
        setTimeout(() => {
          const result = TenantContextStore.get()?.tenantId;
          results.push(`p1:${result}`);
          resolve();
        }, 50);
      });

      const promise2 = new Promise<void>((resolve) => {
        TenantContextStore.set(ctx2);
        setTimeout(() => {
          const result = TenantContextStore.get()?.tenantId;
          results.push(`p2:${result}`);
          resolve();
        }, 50);
      });

      await Promise.all([promise1, promise2]);

      expect(results).toContain('p1:tenant-1');
      expect(results).toContain('p2:tenant-2');
    });

    it('should not leak context between concurrent async operations', async () => {
      const ctx1: TenantContext = { tenantId: 'tenant-A' };
      const ctx2: TenantContext = { tenantId: 'tenant-B' };

      const results: string[] = [];

      const task1 = async () => {
        TenantContextStore.set(ctx1);
        await new Promise((r) => setTimeout(r, 10));
        const ctx = TenantContextStore.get();
        results.push(`task1:${ctx?.tenantId}`);
        return ctx?.tenantId;
      };

      const task2 = async () => {
        TenantContextStore.set(ctx2);
        await new Promise((r) => setTimeout(r, 10));
        const ctx = TenantContextStore.get();
        results.push(`task2:${ctx?.tenantId}`);
        return ctx?.tenantId;
      };

      const [result1, result2] = await Promise.all([task1(), task2()]);

      expect(result1).toBe('tenant-A');
      expect(result2).toBe('tenant-B');
    });
  });
});
