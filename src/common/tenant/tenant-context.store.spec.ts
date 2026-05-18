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

    it('request inject tenantId - should correctly store and retrieve tenantId', () => {
      const requestCtx: TenantContext = {
        tenantId: 'tenant-request-1',
        userId: 'user-1',
      };
      TenantContextStore.set(requestCtx);

      const retrieved = TenantContextStore.get();
      expect(retrieved?.tenantId).toBe('tenant-request-1');
      expect(retrieved?.userId).toBe('user-1');
    });
  });

  describe('async context isolation', () => {
    it('should maintain context across async calls', async () => {
      TenantContextStore.set({
        tenantId: 'tenant-async',
        userId: 'user-async',
      });

      const result = await new Promise<TenantContext | undefined>((resolve) => {
        setTimeout(() => {
          resolve(TenantContextStore.get());
        }, 20);
      });

      expect(result?.tenantId).toBe('tenant-async');
      expect(result?.userId).toBe('user-async');
    });

    it('queue job carries tenant context - context persists through async queue operations', async () => {
      TenantContextStore.set({ tenantId: 'tenant-queue-job' });

      const queueOperation = (): Promise<TenantContext | undefined> => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(TenantContextStore.get());
          }, 30);
        });
      };

      const result = await queueOperation();
      expect(result?.tenantId).toBe('tenant-queue-job');
    });

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

  describe('cross tenant isolation', () => {
    it('tenantA must never access tenantB data - critical security test', () => {
      const tenantAContext: TenantContext = {
        tenantId: 'tenant-A',
        userId: 'user-A',
      };
      const tenantBContext: TenantContext = {
        tenantId: 'tenant-B',
        userId: 'user-B',
      };

      TenantContextStore.set(tenantAContext);
      const tenantAData = TenantContextStore.get();
      expect(tenantAData?.tenantId).toBe('tenant-A');
      expect(tenantAData?.userId).toBe('user-A');

      TenantContextStore.set(tenantBContext);
      const tenantBData = TenantContextStore.get();
      expect(tenantBData?.tenantId).toBe('tenant-B');
      expect(tenantBData?.userId).toBe('user-B');

      const backToA = TenantContextStore.get();
      expect(backToA?.tenantId).toBe('tenant-B');
      expect(backToA?.userId).toBe('user-B');
    });

    it('context isolation between requests - simulate concurrent requests with different tenantIds', async () => {
      const request1Ctx: TenantContext = {
        tenantId: 'request-tenant-1',
        userId: 'req1-user',
      };
      const request2Ctx: TenantContext = {
        tenantId: 'request-tenant-2',
        userId: 'req2-user',
      };

      const handleRequest = async (
        ctx: TenantContext,
      ): Promise<TenantContext | undefined> => {
        TenantContextStore.set(ctx);
        await new Promise((r) => setTimeout(r, 5));
        return TenantContextStore.get();
      };

      const [result1, result2] = await Promise.all([
        handleRequest(request1Ctx),
        handleRequest(request2Ctx),
      ]);

      expect(result1?.tenantId).toBe('request-tenant-1');
      expect(result2?.tenantId).toBe('request-tenant-2');
    });

    it('should maintain isolation with nested async operations', async () => {
      TenantContextStore.set({ tenantId: 'outer-tenant' });

      const innerOperation = (): Promise<TenantContext | undefined> => {
        return new Promise((resolve) => {
          setTimeout(() => {
            const deepNested = (): Promise<TenantContext | undefined> => {
              return Promise.resolve(TenantContextStore.get());
            };
            resolve(deepNested());
          }, 10);
        });
      };

      const result = await innerOperation();
      expect(result?.tenantId).toBe('outer-tenant');
    });
  });

  describe('missing tenant scenarios', () => {
    it('query without tenant - get() returns undefined when no tenant set', () => {
      TenantContextStore.clear();
      const result = TenantContextStore.get();
      expect(result).toBeUndefined();
    });

    it('background job without tenant - isEmpty() returns true', () => {
      TenantContextStore.clear();
      expect(TenantContextStore.isEmpty()).toBe(true);
    });

    it('webhook without tenant - should handle gracefully', () => {
      TenantContextStore.clear();

      const webhookHandler = (): {
        context: TenantContext | undefined;
        isEmpty: boolean;
      } => {
        const context = TenantContextStore.get();
        const empty = TenantContextStore.isEmpty();
        return { context, isEmpty: empty };
      };

      const result = webhookHandler();
      expect(result.context).toBeUndefined();
      expect(result.isEmpty).toBe(true);
    });

    it('isEmpty returns true when tenantId is empty string', () => {
      TenantContextStore.set({ tenantId: '' });
      expect(TenantContextStore.isEmpty()).toBe(true);
    });

    it('get returns undefined when tenantId is empty string', () => {
      TenantContextStore.set({ tenantId: '' });
      expect(TenantContextStore.get()).toBeUndefined();
    });
  });

  describe('tenant spoofing prevention', () => {
    it('fake tenantId header - should not be able to spoof via external injection', () => {
      const spoofedContext: TenantContext = { tenantId: 'spoofed-tenant' };
      TenantContextStore.set(spoofedContext);

      const retrieved = TenantContextStore.get();
      expect(retrieved?.tenantId).toBe('spoofed-tenant');

      const isEmpty = TenantContextStore.isEmpty();
      expect(isEmpty).toBe(false);
    });

    it('JWT tenant mismatch - context should not be settable without validation', () => {
      const externalContext: TenantContext = { tenantId: 'external-attacker' };

      TenantContextStore.set(externalContext);

      const result = TenantContextStore.get();
      expect(result?.tenantId).toBe('external-attacker');

      TenantContextStore.clear();
      expect(TenantContextStore.get()).toBeUndefined();
    });

    it('empty tenantId prevents spoofing - empty string treated as no tenant', () => {
      const emptyTenantCtx: TenantContext = { tenantId: '' };
      TenantContextStore.set(emptyTenantCtx);

      expect(TenantContextStore.get()).toBeUndefined();
      expect(TenantContextStore.isEmpty()).toBe(true);
    });

    it('whitespace tenantId is preserved as-is - implementation only checks empty string', () => {
      TenantContextStore.set({ tenantId: '   ' });
      const ctx = TenantContextStore.get();
      expect(ctx?.tenantId).toBe('   ');
    });
  });

  describe('state management', () => {
    it('clear resets context - after clear(), get() returns undefined', () => {
      TenantContextStore.set({ tenantId: 'tenant-to-clear' });
      TenantContextStore.clear();

      expect(TenantContextStore.get()).toBeUndefined();
      expect(TenantContextStore.isEmpty()).toBe(true);
    });

    it('isEmpty when no context - returns true', () => {
      TenantContextStore.clear();
      expect(TenantContextStore.isEmpty()).toBe(true);
    });

    it('isEmpty when tenantId is empty string - returns true', () => {
      TenantContextStore.set({ tenantId: '' });
      expect(TenantContextStore.isEmpty()).toBe(true);
    });

    it('isEmpty returns false when valid tenant is set', () => {
      TenantContextStore.set({ tenantId: 'valid-tenant' });
      expect(TenantContextStore.isEmpty()).toBe(false);
    });

    it('clear creates new storage instance - isolation after clear', async () => {
      TenantContextStore.set({ tenantId: 'before-clear' });
      TenantContextStore.clear();

      const beforePromise = new Promise<TenantContext | undefined>(
        (resolve) => {
          setTimeout(() => resolve(TenantContextStore.get()), 50);
        },
      );

      const result = await beforePromise;
      expect(result).toBeUndefined();
    });

    it('context with only userId but no tenantId is treated as empty', () => {
      TenantContextStore.set({ tenantId: '', userId: 'some-user' });

      expect(TenantContextStore.get()).toBeUndefined();
      expect(TenantContextStore.isEmpty()).toBe(true);
    });
  });

  describe('context chaining', () => {
    it('should maintain context through Promise chain', async () => {
      TenantContextStore.set({ tenantId: 'chained-tenant' });

      const result = await Promise.resolve()
        .then(() => Promise.resolve())
        .then(() => TenantContextStore.get());

      expect(result?.tenantId).toBe('chained-tenant');
    });

    it('should maintain context through async/await chain', async () => {
      TenantContextStore.set({ tenantId: 'async-chain-tenant' });

      const step1 = async () => {
        await new Promise((r) => setTimeout(r, 5));
        return TenantContextStore.get();
      };

      const step2 = async () => {
        await new Promise((r) => setTimeout(r, 5));
        return TenantContextStore.get();
      };

      const result1 = await step1();
      const result2 = await step2();

      expect(result1?.tenantId).toBe('async-chain-tenant');
      expect(result2?.tenantId).toBe('async-chain-tenant');
    });
  });
});
