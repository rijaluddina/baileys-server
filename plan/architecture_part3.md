# WhatsApp API Platform — Architecture Blueprint (Part 3/4)

> Decisions locked from Part 2 review:
> - **RPC**: hybrid — Redis pub/sub for ephemeral, BullMQ for reliable command execution
> - **Event streams**: Redis Streams for realtime + replay, PostgreSQL for long-term persistence
> - **WebSocket**: Socket.IO V1, abstracted transport layer for future migration

---

## 11. Multi-Tenant Architecture

### Tenant Isolation Model

```mermaid
graph TB
    subgraph "Request Flow"
        REQ[Incoming Request]
        AUTH[Auth Guard<br/>API Key / JWT]
        TC[Tenant Context<br/>Middleware]
        RL[Rate Limiter<br/>per tenant]
        CTRL[Controller]
        SVC[Service Layer]
        DB[Database<br/>WHERE tenant_id = ?]
    end

    REQ --> AUTH --> TC --> RL --> CTRL --> SVC --> DB
```

### Tenant Context Propagation

```typescript
// Extracted from API Key or JWT at guard level
interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  userId?: string;          // JWT only (dashboard users)
  role?: TenantRole;        // owner | admin | member
  permissions: string[];    // RBAC permissions
  limits: TenantLimits;     // operator-defined
  source: 'api_key' | 'jwt';
}

// Injected via AsyncLocalStorage — available everywhere without prop drilling
// cls-hooked or Node.js native AsyncLocalStorage
class TenantContextStore {
  private static storage = new AsyncLocalStorage<TenantContext>();
  
  static run(ctx: TenantContext, fn: () => void) {
    this.storage.run(ctx, fn);
  }
  
  static get(): TenantContext {
    const ctx = this.storage.getStore();
    if (!ctx) throw new Error('No tenant context');
    return ctx;
  }
}
```

### Tenant-Scoped Data Access

```typescript
// Prisma middleware — auto-inject tenant_id on all queries
// Prevents cross-tenant data leaks

prisma.$use(async (params, next) => {
  const ctx = TenantContextStore.get();
  const tenantScopedModels = [
    'Session', 'Message', 'Chat', 'Contact', 'Group',
    'Webhook', 'WebhookDelivery', 'ApiKey', 'AuditLog',
    'SessionEvent', 'SessionCapability',
  ];
  
  if (tenantScopedModels.includes(params.model)) {
    // Auto-inject tenant filter on reads
    if (['findMany', 'findFirst', 'findUnique', 'count', 'aggregate'].includes(params.action)) {
      params.args.where = { ...params.args.where, tenantId: ctx.tenantId };
    }
    // Auto-set tenant on creates
    if (['create', 'createMany'].includes(params.action)) {
      params.args.data = { ...params.args.data, tenantId: ctx.tenantId };
    }
  }
  
  return next(params);
});
```

### Operator-Defined Resource Limits

```typescript
interface TenantLimits {
  maxSessions: number;              // default: 10
  maxConcurrentJobs: number;        // default: 50
  maxWebhooks: number;              // default: 5
  maxWebsocketConnections: number;  // default: 10
  maxMediaUploadSizeMb: number;     // default: 64
  rateLimits: {
    global: { max: number; windowSec: number };        // 1000/min
    perEndpoint: Record<string, { max: number; windowSec: number }>;
    perSession: { max: number; windowSec: number };    // 100/min
  };
}

// Resolution order:
// 1. Tenant-specific override (wa:limits:tenant:{id} in Redis)
// 2. Global defaults (wa:limits:global in Redis)
// 3. Hardcoded application defaults

// Admin API for operators:
// GET    /v1/admin/limits/global
// PUT    /v1/admin/limits/global
// GET    /v1/admin/limits/tenants/:id
// PUT    /v1/admin/limits/tenants/:id
// DELETE /v1/admin/limits/tenants/:id  → revert to global
```

### Tenant Provisioning

```typescript
// POST /v1/admin/tenants
interface CreateTenantDto {
  name: string;
  slug: string;           // unique, URL-safe
  settings?: {
    defaultCapabilities?: Record<string, boolean>;
    webhookDefaults?: { maxRetries: number; timeoutMs: number };
  };
  limits?: Partial<TenantLimits>;  // override global
  owner: {
    email: string;
    password: string;      // hashed with argon2
  };
}

// Response includes first API key auto-generated
```

---

## 12. Horizontal Scaling Strategy

### Scaling Matrix

| Component | Scaling Method | State | Bottleneck |
|---|---|---|---|
| **API Server** | Horizontal, stateless | None — all in PG/Redis | CPU (request processing) |
| **WS Gateway** | Horizontal + Redis adapter | Socket.IO Redis adapter | Memory (connections) |
| **Session Worker** | Horizontal, distributed lock | Baileys sockets in-memory | Memory + WA rate limits |
| **Queue Worker** | Horizontal, BullMQ consumers | Stateless | CPU + IO |
| **PostgreSQL** | Vertical + read replicas | Persistent | Disk IO |
| **Redis** | Vertical / Redis Cluster | In-memory | Memory |

### API Server Scaling

```mermaid
graph TB
    LB[Load Balancer<br/>Round Robin]
    API1[API Server 1<br/>PORT 3001]
    API2[API Server 2<br/>PORT 3002]
    API3[API Server N<br/>PORT 300N]
    
    LB --> API1 & API2 & API3
    API1 & API2 & API3 --> PG[(PostgreSQL)]
    API1 & API2 & API3 --> Redis[(Redis)]
```

- Fully stateless — scale by adding instances behind LB
- No sticky sessions needed for REST API
- Health check: `GET /health` → `{ status: 'ok', uptime, version }`

### WebSocket Scaling with Socket.IO Redis Adapter

```typescript
// Each WS gateway instance uses Socket.IO Redis adapter
// Events published on one instance → broadcast to all
import { createAdapter } from '@socket.io/redis-adapter';

const pubClient = createClient({ url: REDIS_URL });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

// Room structure:
// tenant:{tenantId}              → all events for tenant
// session:{sessionId}            → single session events
// tenant:{tenantId}:session:{id} → scoped room
```

### Session Worker Scaling

```
┌─────────────────────────────────────────────┐
│           Session Assignment                │
│                                             │
│  Worker 1 (capacity: 50)                    │
│  ├── session-a (locked)                     │
│  ├── session-b (locked)                     │
│  └── session-c (locked)                     │
│                                             │
│  Worker 2 (capacity: 50)                    │
│  ├── session-d (locked)                     │
│  └── session-e (locked)                     │
│                                             │
│  Worker 3 (capacity: 50)                    │
│  └── (idle — available for new sessions)    │
│                                             │
│  Assignment: least-loaded first             │
│  Rebalance: on worker join/leave            │
│  Failover: lock expiry → other worker claims│
└─────────────────────────────────────────────┘
```

### Queue Worker Scaling

```typescript
// BullMQ handles distribution natively
// Multiple workers subscribe to same queue → automatic work distribution
// No coordination needed — Redis handles job locking

// Scale strategy:
// 1. Monitor queue depth metrics
// 2. If queue depth > threshold for > 30s → scale up workers
// 3. If queue workers idle > 5min → scale down
// 4. K8s: HPA on custom metric (queue depth)
```

### Database Scaling

```
Phase 1 (single-node / small):
  PostgreSQL single instance
  
Phase 2 (medium):
  PostgreSQL primary + read replica
  Read replica for: analytics, event queries, webhook history
  Primary for: writes, session state, auth state
  
Phase 3 (large):
  Consider table partitioning:
  - Message table → partition by session_id (hash)
  - SessionEvent → partition by created_at (range, monthly)
  - AuditLog → partition by created_at (range, monthly)
  - WebhookDelivery → partition by created_at (range, weekly)
```

---

## 13. Deployment Topology

### Topology 1: Single-Node (Dev / Small)

```mermaid
graph TB
    subgraph "Single Process"
        APP[NestJS App<br/>WORKER_MODE=unified]
        API[REST API + WS Gateway]
        SW[Session Worker]
        QW[Queue Workers]
    end

    subgraph "Infrastructure"
        PG[(PostgreSQL)]
        RD[(Redis)]
        S3[(MinIO / RustFS)]
    end

    APP --> API & SW & QW
    APP --> PG & RD & S3
```

```yaml
# .env for single-node
WORKER_MODE=unified
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/whatsapp_api
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
```

### Topology 2: Docker Compose (Medium)

```yaml
# docker-compose.yml
services:
  api:
    build: .
    environment:
      WORKER_MODE: api
      PORT: 3000
    ports: ["3000:3000"]
    deploy:
      replicas: 2

  session-worker:
    build: .
    environment:
      WORKER_MODE: session
      MAX_SESSIONS_PER_WORKER: 50
    deploy:
      replicas: 2

  queue-worker:
    build: .
    environment:
      WORKER_MODE: queue
    deploy:
      replicas: 2

  postgres:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: whatsapp_api

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes: ["minio_data:/data"]

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    # upstream to api:3000, ws sticky to api:3000

volumes:
  pgdata:
  minio_data:
```

### Topology 3: Kubernetes (Production)

```
┌─────────────────────────────────────────────────────┐
│                   Kubernetes Cluster                │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ Ingress      │  │ Ingress      │                 │
│  │ (REST API)   │  │ (WebSocket)  │                 │
│  └──────┬───────┘  └──────┬───────┘                 │
│         │                  │                        │
│  ┌──────▼───────┐  ┌──────▼───────┐                 │
│  │ Deployment   │  │ Deployment   │                 │
│  │ api (HPA)    │  │ api (HPA)    │                 │
│  │ 2-10 pods    │  │ sticky sess  │                 │
│  └──────────────┘  └──────────────┘                 │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ Deployment   │  │ Deployment   │                 │
│  │ session-wkr  │  │ queue-wkr    │                 │
│  │ 2-N pods     │  │ 2-N pods     │                 │
│  │ (HPA custom) │  │ (HPA queue)  │                 │
│  └──────────────┘  └──────────────┘                 │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ StatefulSet  │  │ StatefulSet  │  │ Deployment │ │
│  │ PostgreSQL   │  │ Redis        │  │ MinIO      │ │
│  │ (or managed) │  │ (or managed) │  │ (or S3)    │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

### HPA Metrics

| Deployment | Scale On | Target | Min | Max |
|---|---|---|---|---|
| api | CPU utilization | 70% | 2 | 10 |
| session-worker | custom: sessions per worker | 40 (of 50 capacity) | 2 | 20 |
| queue-worker | custom: queue depth | < 100 pending | 2 | 10 |

---

## 14. OpenAPI Design Guidelines

### Contract-First Workflow

```mermaid
graph LR
    SPEC[openapi.yaml<br/>Single Source of Truth]
    
    SPEC --> VAL[Validation<br/>spectral lint]
    SPEC --> GEN[Code Gen<br/>NestJS decorators]
    SPEC --> DOC[Documentation<br/>Swagger UI / Redoc]
    SPEC --> SDK[Client SDK<br/>openapi-generator]
    SPEC --> TEST[Contract Tests<br/>prism mock server]
```

### API Versioning

```
Base URL: /v1/...
Header:   X-API-Version: 2026-05-01 (date-based for breaking changes within v1)

# Version lifecycle:
# /v1  → current stable
# /v2  → future (when breaking changes needed)
# /v1 sunset → 12-month deprecation notice via Sunset header
```

### Standard Response Envelope

```typescript
// Success response
interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    pagination?: PaginationMeta;
    requestId: string;
    timestamp: string;
  };
}

// Error response
interface ApiErrorResponse {
  success: false;
  error: {
    code: string;           // machine-readable: SESSION_NOT_FOUND
    message: string;        // human-readable
    details?: unknown[];    // validation errors array
    docs?: string;          // link to docs
  };
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

// Pagination
interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  cursor?: string;         // for cursor-based
  hasMore: boolean;
}
```

### Endpoint Stability Metadata

```yaml
# OpenAPI extension for stability level
paths:
  /v1/sessions/{sessionId}/messages:
    post:
      x-stability: stable
      x-since: "2026-05-01"
      tags: [Messaging]
      
  /v1/sessions/{sessionId}/newsletters:
    get:
      x-stability: experimental
      x-since: "2026-06-01"
      tags: [Newsletter]
      
  /v1/sessions/{sessionId}/communities:
    get:
      x-stability: planned
      x-since: null
      tags: [Community]
```

### Standard Error Codes

```typescript
enum ErrorCode {
  // Auth
  AUTH_INVALID_KEY = 'AUTH_INVALID_KEY',
  AUTH_EXPIRED_TOKEN = 'AUTH_EXPIRED_TOKEN',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_INSUFFICIENT_PERMISSIONS',
  
  // Tenant
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_LIMIT_EXCEEDED = 'TENANT_LIMIT_EXCEEDED',
  
  // Session
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_NOT_CONNECTED = 'SESSION_NOT_CONNECTED',
  SESSION_ALREADY_EXISTS = 'SESSION_ALREADY_EXISTS',
  SESSION_LIMIT_EXCEEDED = 'SESSION_LIMIT_EXCEEDED',
  
  // Capability
  FEATURE_NOT_ENABLED = 'FEATURE_NOT_ENABLED',
  FEATURE_PLANNED = 'FEATURE_PLANNED',
  
  // Messaging
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  INVALID_JID = 'INVALID_JID',
  
  // Media
  MEDIA_TOO_LARGE = 'MEDIA_TOO_LARGE',
  MEDIA_UPLOAD_FAILED = 'MEDIA_UPLOAD_FAILED',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // General
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```

### Standard Headers

```
# Request headers
Authorization: Bearer <api-key-or-jwt>
X-Idempotency-Key: <uuid>              # write operations
X-Correlation-Id: <uuid>               # request tracing (auto-generated if absent)
X-Tenant-Id: <slug>                    # optional, derived from auth

# Response headers
X-Request-Id: <uuid>                   # server-generated
X-Correlation-Id: <uuid>              # echo back
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1620000000
Retry-After: 30                        # on 429
```

---

## 15. Security Architecture

### Authentication Flow

```mermaid
graph TB
    subgraph "API Key Auth (M2M)"
        AK[Authorization: Bearer sk_live_xxx]
        AKV[Lookup key_hash in DB]
        AKC[Check: not revoked, not expired]
        AKT[Extract tenant context]
    end

    subgraph "JWT Auth (Dashboard)"
        LP[POST /v1/auth/login<br/>email + password]
        VER[Verify argon2 hash]
        ISS[Issue access_token + refresh_token]
        JWT[Authorization: Bearer eyJhb...]
        JWTV[Verify JWT signature]
        JWTT[Extract tenant + user + role]
    end

    AK --> AKV --> AKC --> AKT
    LP --> VER --> ISS
    JWT --> JWTV --> JWTT
```

### API Key Design

```typescript
// Key format: sk_live_<random32chars>  or  sk_test_<random32chars>
// Storage: only key_hash (SHA-256) stored in DB
// key_prefix (first 8 chars) stored for identification
// Full key shown ONCE at creation — never retrievable again

interface ApiKeyRecord {
  id: string;
  tenantId: string;
  keyHash: string;          // SHA-256(full_key)
  keyPrefix: string;        // "sk_live_a" (first 8)
  name: string;             // user-given label
  permissions: string[];    // RBAC scopes
  ipWhitelist?: string[];   // optional IP restriction
  expiresAt?: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
}
```

### JWT Token Design

```typescript
// Access token — short-lived
interface AccessTokenPayload {
  sub: string;              // userId
  tid: string;              // tenantId
  role: TenantRole;
  permissions: string[];
  iat: number;
  exp: number;              // 15 minutes
}

// Refresh token — long-lived, stored in DB
interface RefreshTokenRecord {
  id: string;
  userId: string;
  tenantId: string;
  tokenHash: string;        // SHA-256
  userAgent: string;
  ipAddress: string;
  expiresAt: Date;          // 30 days
  revokedAt?: Date;
}

// Token endpoints:
// POST /v1/auth/login          → { accessToken, refreshToken }
// POST /v1/auth/refresh        → { accessToken, refreshToken }
// POST /v1/auth/logout         → revoke refresh token
// POST /v1/auth/logout-all     → revoke all refresh tokens for user
```

### RBAC Permission System

```typescript
// Role hierarchy
type TenantRole = 'owner' | 'admin' | 'member';

// Permission scopes
const PERMISSIONS = {
  // Session management
  'session:create': ['owner', 'admin'],
  'session:read': ['owner', 'admin', 'member'],
  'session:delete': ['owner', 'admin'],
  'session:configure': ['owner', 'admin'],
  
  // Messaging
  'message:send': ['owner', 'admin', 'member'],
  'message:read': ['owner', 'admin', 'member'],
  'message:delete': ['owner', 'admin'],
  
  // Group management
  'group:manage': ['owner', 'admin'],
  'group:read': ['owner', 'admin', 'member'],
  
  // Webhook management
  'webhook:manage': ['owner', 'admin'],
  'webhook:read': ['owner', 'admin', 'member'],
  
  // Tenant administration
  'tenant:manage': ['owner'],
  'tenant:read': ['owner', 'admin'],
  'apikey:manage': ['owner', 'admin'],
  'apikey:read': ['owner', 'admin'],
  'user:manage': ['owner'],
  
  // Admin operations (operator-level)
  'admin:*': [],  // operator API key only, not role-based
} as const;

// Guard decorator
@RequirePermission('session:create')
@Post('sessions')
async createSession() { ... }
```

### Rate Limiting

```typescript
// Multi-layer rate limiting
interface RateLimitConfig {
  // Layer 1: Global per-tenant
  global: { max: 1000, windowSec: 60 };
  
  // Layer 2: Per-endpoint
  endpoints: {
    'POST /v1/sessions/:id/messages': { max: 60, windowSec: 60 };
    'POST /v1/sessions': { max: 5, windowSec: 60 };
    'GET /v1/*': { max: 300, windowSec: 60 };
  };
  
  // Layer 3: Per-session (WhatsApp protection)
  perSession: { max: 30, windowSec: 60 };
}

// Implementation: Redis sliding window
// Key: wa:ratelimit:{tenantId}:{endpoint}:{window}
// Algorithm: INCR + EXPIRE (simple) or sorted set (sliding window)
```

### Webhook Signature Verification

```typescript
// HMAC-SHA256 signature
// Header: X-Webhook-Signature: sha256=<hex>

function signWebhook(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// Webhook delivery includes:
// X-Webhook-Signature: sha256=abc123...
// X-Webhook-Id: <delivery-id>
// X-Webhook-Timestamp: <unix-timestamp>
// Content-Type: application/json

// Recipient verifies:
// 1. Compute HMAC of raw body with their webhook secret
// 2. Compare with X-Webhook-Signature
// 3. Check X-Webhook-Timestamp within 5 minutes (replay protection)
```

### Encrypted Auth State

```typescript
// Baileys auth state (creds + signal keys) encrypted at rest in PostgreSQL
// Encryption: AES-256-GCM
// Key derivation: per-session from master key + session ID

interface EncryptedAuthState {
  sessionId: string;
  type: string;
  keyId: string;
  data: Buffer;        // AES-256-GCM encrypted
  iv: Buffer;          // 12 bytes
  authTag: Buffer;     // 16 bytes
}

// Master key: env ENCRYPTION_MASTER_KEY (32 bytes, hex)
// Per-session key: HKDF(masterKey, sessionId, 'auth-state')
```

### IP Whitelist

```typescript
// Per API key — optional
// Validated at guard level before any processing

// Configuration:
// CIDR notation support: 192.168.1.0/24
// IPv4 and IPv6
// Bypass for localhost in dev mode

interface IpWhitelistConfig {
  enabled: boolean;
  allowedCidrs: string[];
  // Applied per API key or per tenant
}
```

### Security Headers (API Response)

```typescript
// Fastify helmet plugin
app.register(helmet, {
  contentSecurityPolicy: false,  // API, not web page
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// Additional headers:
// X-Content-Type-Options: nosniff
// X-Frame-Options: DENY
// Strict-Transport-Security: max-age=31536000
// Cache-Control: no-store (for sensitive endpoints)
```

---

## Open Questions (Part 3)

> [!IMPORTANT]
> 1. **Admin API separation** — operator admin endpoints (`/v1/admin/*`) same API server or separate process/port? Same server = simpler, separate = better security isolation.
> 2. **Audit log granularity** — log every API call, or only mutations (POST/PUT/PATCH/DELETE)? Every call = more storage, mutations only = miss read-access auditing.
> 3. **Auth state backup to S3** — auto-backup encrypted auth state to S3 on every creds.update, or manual/scheduled only? Auto = safer, scheduled = less S3 writes.

---

## Next Part

- **Part 4:** Sequence Diagrams, Production Best Practices, Failure Recovery, Module Boundaries, Coding Standards, Microservice Extraction Strategy

**Review Part 3 → jawab open questions → proceed Part 4 (final).**
