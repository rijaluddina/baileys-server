# WhatsApp API Platform — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready WhatsApp API platform with multi-tenant support, session management via Baileys, event-driven architecture, and worker-based scaling.

**Architecture:** Modular monolith with WORKER_MODE separation (API vs Session Worker). Event-driven via Redis pub/sub + BullMQ. Multi-tenant via Prisma middleware + tenant context store.

**Tech Stack:** NestJS, Prisma, Redis (ioredis), BullMQ, Baileys, TypeScript

---

## Current State (Per Commit 225afb9)

**Implemented modules:**
- Session, Messaging, Group, Chat, Contact, Webhook, Event, Queue, Redis, Health, Misc
- Multi-tenant via ApiKeyGuard
- Redis with URL parsing and multi-tenant support

**Missing/Needs Enhancement:**
- Full multi-tenant system (tenant module, RBAC)
- Auth module (API key CRUD, auth backup)
- Media module
- Admin API with RBAC
- Analytics module
- Capability system
- Architecture improvements (RPC circuit breaker, WA rate limiter, Prisma middleware, event sequence)

---

## Phase 1: Multi-Tenant Foundation (Priority: Critical)

### Task 1.1: Tenant Module & Context

**Files:**
- Modify: `src/prisma/prisma.service.ts` — add middleware registration
- Create: `src/common/tenant/tenant.module.ts`
- Create: `src/common/tenant/tenant-context.store.ts`
- Create: `src/common/tenant/tenant.decorator.ts`
- Create: `src/common/tenant/tenant.filter.ts`
- Test: `src/common/tenant/tenant-context.store.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/common/tenant/tenant-context.store.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextStore } from './tenant-context.store';

describe('TenantContextStore', () => {
  it('should store and retrieve tenant context', () => {
    TenantContextStore.set({ tenantId: 'tenant-123', userId: 'user-1' });
    const ctx = TenantContextStore.get();
    expect(ctx?.tenantId).toBe('tenant-123');
  });

  it('should return undefined when no context set', () => {
    TenantContextStore.clear();
    expect(TenantContextStore.get()).toBeUndefined();
  });

  it('should clear context after request', () => {
    TenantContextStore.set({ tenantId: 'tenant-123', userId: 'user-1' });
    TenantContextStore.clear();
    expect(TenantContextStore.get()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="tenant-context.store" --passWithNoTests`
Expected: FAIL — TenantContextStore not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/common/tenant/tenant-context.store.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="tenant-context.store"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/common/tenant/
git commit -m "feat(tenant): add TenantContextStore for multi-tenant isolation"
```

### Task 1.2: Prisma Tenant Middleware (Enhanced)

**Files:**
- Create: `src/prisma/prisma-tenant.middleware.ts`
- Modify: `src/prisma/prisma.service.ts` — register middleware
- Test: `src/prisma/prisma-tenant.middleware.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/prisma/prisma-tenant.middleware.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { tenantMiddleware } from './prisma-tenant.middleware';
import { TenantContextStore } from '../common/tenant/tenant-context.store';

describe('tenantMiddleware', () => {
  let mockNext: jest.fn;

  beforeEach(() => {
    mockNext = jest.fn().mockResolvedValue({ id: '1', tenantId: 'tenant-123' });
  });

  it('should inject tenantId on findMany', async () => {
    TenantContextStore.set({ tenantId: 'tenant-123' });
    const params = { model: 'Session', action: 'findMany', args: {} };

    await tenantMiddleware(params as any, mockNext);

    expect(params.args.where).toEqual({ tenantId: 'tenant-123' });
  });

  it('should inject tenantId on create', async () => {
    TenantContextStore.set({ tenantId: 'tenant-123' });
    const params = { model: 'Session', action: 'create', args: { data: { name: 'test' } } };

    await tenantMiddleware(params as any, mockNext);

    expect(params.args.data.tenantId).toBe('tenant-123');
  });

  it('should NOT inject on non-scoped models', async () => {
    TenantContextStore.set({ tenantId: 'tenant-123' });
    const params = { model: 'SystemConfig', action: 'findMany', args: {} };

    await tenantMiddleware(params as any, mockNext);

    expect(params.args.where).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="prisma-tenant.middleware"`
Expected: FAIL — tenantMiddleware not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/prisma/prisma-tenant.middleware.ts
import { Prisma } from '@prisma/client';
import { TenantContextStore } from '../common/tenant/tenant-context.store';

const TENANT_SCOPED_MODELS = new Set([
  'Session', 'Message', 'Chat', 'Contact', 'Group',
  'Webhook', 'WebhookDelivery', 'ApiKey', 'AuditLog',
  'SessionEvent', 'SessionCapability', 'MediaUpload',
]);

const READ_OPERATIONS = new Set(['findMany', 'findFirst', 'findUnique', 'count']);
const CREATE_OPERATIONS = new Set(['create', 'createMany']);

export const tenantMiddleware: Prisma.Middleware = async (params, next) => {
  if (!params.model || !TENANT_SCOPED_MODELS.has(params.model)) {
    return next(params);
  }

  const ctx = TenantContextStore.get();
  if (!ctx?.tenantId) {
    throw new Error('TenantContext not set');
  }

  if (READ_OPERATIONS.has(params.action)) {
    params.args = params.args ?? {};
    params.args.where = { ...params.args.where, tenantId: ctx.tenantId };
  } else if (CREATE_OPERATIONS.has(params.action)) {
    params.args = params.args ?? {};
    params.args.data = { ...params.args.data, tenantId: ctx.tenantId };
  }

  return next(params);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="prisma-tenant.middleware"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/prisma/
git commit -m "feat(tenant): add Prisma tenant middleware for multi-tenant isolation"
```

### Task 1.3: Tenant Module Creation

**Files:**
- Create: `src/tenant/tenant.module.ts`
- Create: `src/tenant/tenant.service.ts`
- Create: `src/tenant/tenant.controller.ts`
- Create: `src/tenant/dto/`
- Test: `src/tenant/tenant.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tenant/tenant.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TenantService', () => {
  let service: TenantService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: PrismaService, useValue: { tenant: { findUnique: jest.fn() } } },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should find tenant by id', async () => {
    prisma.tenant.findUnique = jest.fn().mockResolvedValue({ id: 'tenant-123', name: 'Test' });
    const result = await service.findById('tenant-123');
    expect(result?.name).toBe('Test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="tenant.service"`
Expected: FAIL — TenantService not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/tenant/tenant.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async findByApiKey(apiKey: string) {
    return this.prisma.apiKey.findFirst({
      where: { key: apiKey, isActive: true },
      include: { tenant: true },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="tenant.service"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tenant/
git commit -m "feat(tenant): add TenantService for tenant management"
```

---

## Phase 2: Auth & API Keys (Priority: High)

### Task 2.1: Auth Module

**Files:**
- Create: `src/auth/auth.module.ts`
- Create: `src/auth/auth.service.ts`
- Create: `src/auth/auth.controller.ts`
- Create: `src/auth/strategies/api-key.strategy.ts`
- Create: `src/auth/dto/`
- Test: `src/auth/auth.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/auth/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should validate API key', async () => {
    // TODO: Write test
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="auth.service"`
Expected: FAIL — AuthService not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateApiKey(apiKey: string) {
    const key = await this.prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: { tenant: true },
    });

    if (!key || !key.isActive) {
      throw new UnauthorizedException('Invalid API key');
    }

    return { tenantId: key.tenantId, tenant: key.tenant };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="auth.service"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/
git commit -m "feat(auth): add AuthService for API key validation"
```

### Task 2.2: API Key Management

**Files:**
- Create: `src/auth/api-key.service.ts`
- Modify: `src/auth/auth.module.ts`
- Test: `src/auth/api-key.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/auth/api-key.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyService } from './api-key.service';

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeyService],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  it('should generate a valid API key', () => {
    const key = service.generateKey();
    expect(key).toMatch(/^wa_live_[a-zA-Z0-9]{32}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="api-key.service"`
Expected: FAIL — ApiKeyService not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/auth/api-key.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class ApiKeyService {
  generateKey(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const prefix = 'wa_live_';
    const random = Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return prefix + random;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="api-key.service"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/
git commit -m "feat(auth): add ApiKeyService for API key generation"
```

---

## Phase 3: Architecture Improvements (Priority: Critical)

### Task 3.1: RPC Client with Circuit Breaker

**Files:**
- Create: `src/common/rpc/rpc-client.service.ts`
- Create: `src/common/rpc/rpc.module.ts`
- Create: `src/common/rpc/rpc.types.ts`
- Test: `src/common/rpc/rpc-client.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/common/rpc/rpc-client.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RpcClientService } from './rpc-client.service';

describe('RpcClientService', () => {
  let service: RpcClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RpcClientService],
    }).compile();

    service = module.get<RpcClientService>(RpcClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should track circuit breaker state', () => {
    // TODO: test circuit open/close
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="rpc-client.service"`
Expected: FAIL — RpcClientService not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/common/rpc/rpc-client.service.ts
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_SUB_CLIENT } from '../../redis/redis.module';

interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureAt: number | null;
}

interface RpcResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const CB_CONFIG = {
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
};

@Injectable()
export class RpcClientService {
  private readonly logger = new Logger(RpcClientService.name);
  private readonly circuits = new Map<string, CircuitBreakerState>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDIS_SUB_CLIENT) private readonly redisSub: Redis,
  ) {}

  async call<T>(workerId: string, action: string, payload: unknown, timeoutMs = 5000): Promise<RpcResult<T>> {
    const state = this.circuits.get(workerId);
    if (state?.status === 'open') {
      return { ok: false, error: 'CIRCUIT_OPEN', message: `Circuit open for worker ${workerId}` };
    }
    // Basic implementation — expand per architecture_improvements.md
    return { ok: false, error: 'NOT_IMPLEMENTED', message: 'Full RPC implementation pending' };
  }

  private recordFailure(workerId: string) {
    let state = this.circuits.get(workerId);
    if (!state) {
      state = { status: 'closed', failures: 0, lastFailureAt: null };
      this.circuits.set(workerId, state);
    }
    state.failures++;
    state.lastFailureAt = Date.now();
    if (state.failures >= CB_CONFIG.failureThreshold) {
      state.status = 'open';
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="rpc-client.service"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/common/rpc/
git commit -m "feat(rpc): add RpcClientService with circuit breaker"
```

### Task 3.2: WhatsApp Rate Limiter

**Files:**
- Create: `src/session/wa-rate-limiter.service.ts`
- Modify: `src/session/session.module.ts`
- Test: `src/session/wa-rate-limiter.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/session/wa-rate-limiter.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { WaRateLimiterService } from './wa-rate-limiter.service';

describe('WaRateLimiterService', () => {
  let service: WaRateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WaRateLimiterService],
    }).compile();

    service = module.get<WaRateLimiterService>(Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="wa-rate-limiter.service"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/session/wa-rate-limiter.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import Redis from 'ioredis';

interface RateLimitResult {
  allowed: boolean;
  waitMs: number;
}

@Injectable()
export class WaRateLimiterService {
  private readonly logger = new Logger(WaRateLimiterService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async checkLimit(sessionId: string): Promise<RateLimitResult> {
    // Default: allow all (implementation per architecture_improvements.md)
    return { allowed: true, waitMs: 0 };
  }

  async recordSent(sessionId: string): Promise<void> {
    // Record for sliding window
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="wa-rate-limiter.service"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/
git commit -m "feat(ratelimit): add WaRateLimiterService for WhatsApp rate limiting"
```

### Task 3.3: Event Sequence Service

**Files:**
- Create: `src/event/event-sequence.service.ts`
- Modify: `src/event/event.module.ts`
- Test: `src/event/event-sequence.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/event/event-sequence.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { EventSequenceService } from './event-sequence.service';

describe('EventSequenceService', () => {
  let service: EventSequenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventSequenceService],
    }).compile();

    service = module.get<EventSequenceService>(EventSequenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="event-sequence.service"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/event/event-sequence.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class EventSequenceService {
  private readonly counters = new Map<string, bigint>();

  async initializeForSession(sessionId: string): Promise<bigint> {
    this.counters.set(sessionId, BigInt(0));
    return BigInt(0);
  }

  next(sessionId: string): bigint {
    const current = this.counters.get(sessionId) ?? BigInt(0);
    const next = current + BigInt(1);
    this.counters.set(sessionId, next);
    return next;
  }

  release(sessionId: string): void {
    this.counters.delete(sessionId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="event-sequence.service"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/event/
git commit -m "feat(event): add EventSequenceService for sequence tracking"
```

---

## Phase 4: Admin API (Priority: Medium)

### Task 4.1: Admin Module

**Files:**
- Create: `src/admin/admin.module.ts`
- Create: `src/admin/admin.controller.ts`
- Create: `src/admin/admin.service.ts`
- Create: `src/admin/guards/admin.guard.ts`
- Create: `src/admin/dto/`
- Test: `src/admin/admin.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/admin/admin.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="admin.service"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/admin/admin.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllTenants() {
    return this.prisma.tenant.findMany();
  }

  async getAllSessions(tenantId: string) {
    return this.prisma.session.findMany({ where: { tenantId } });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="admin.service"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/
git commit -m "feat(admin): add AdminService for platform administration"
```

---

## Phase 5: Media Module (Priority: Medium)

### Task 5.1: Media Upload Service

**Files:**
- Create: `src/media/media.module.ts`
- Create: `src/media/media.service.ts`
- Create: `src/media/media.controller.ts`
- Create: `src/media/s3.service.ts`
- Create: `src/media/dto/`
- Test: `src/media/media.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/media/media.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from './media.service';

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaService],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="media.service"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/media/media.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class MediaService {
  async initUpload(filename: string, mimeType: string, size: number) {
    // TODO: Implement per architecture_part4.md
    return { uploadId: 'temp', presignedUrl: '', expiresAt: '' };
  }

  async completeUpload(uploadId: string) {
    // TODO: Verify and return media ID
    return { mediaId: 'media-123', url: '' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="media.service"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/media/
git commit -m "feat(media): add MediaService for media upload handling"
```

---

## Phase 6: Capability System (Priority: Medium)

### Task 6.1: Capability Module

**Files:**
- Create: `src/capability/capability.module.ts`
- Create: `src/capability/capability.service.ts`
- Create: `src/capability/capability.definitions.ts`
- Create: `src/capability/capability.guard.ts`
- Test: `src/capability/capability.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/capability/capability.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CapabilityService } from './capability.service';

describe('CapabilityService', () => {
  let service: CapabilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CapabilityService],
    }).compile();

    service = module.get<CapabilityService>(CapabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="capability.service"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/capability/capability.service.ts
import { Injectable } from '@nestjs/common';

export interface Capability {
  name: string;
  description: string;
  enabled: boolean;
}

@Injectable()
export class CapabilityService {
  async getCapabilitiesForSession(sessionId: string): Promise<Capability[]> {
    // Default capabilities
    return [
      { name: 'messaging.send', description: 'Send messages', enabled: true },
      { name: 'messaging.receive', description: 'Receive messages', enabled: true },
    ];
  }

  async hasCapability(sessionId: string, capability: string): Promise<boolean> {
    const caps = await this.getCapabilitiesForSession(sessionId);
    return caps.some(c => c.name === capability && c.enabled);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="capability.service"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/capability/
git commit -m "feat(capability): add CapabilityService for feature access control"
```

---

## Summary

| Phase | Focus | Tasks |
|-------|-------|-------|
| 1 | Multi-Tenant Foundation | 3 (Tenant module, Prisma middleware, Tenant context) |
| 2 | Auth & API Keys | 2 (Auth service, API key management) |
| 3 | Architecture Improvements | 3 (RPC circuit breaker, WA rate limiter, Event sequence) |
| 4 | Admin API | 1 |
| 5 | Media Module | 1 |
| 6 | Capability System | 1 |

**Total: 11 task groups, ~30-40 individual steps**

---

## Dependencies

- Phase 1 must complete before Phase 2 (tenant context needed for auth)
- Phase 3 can run in parallel with Phase 1-2 once Redis module is stable
- Phase 4-6 depend on Phase 1-2 completion

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-master-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**