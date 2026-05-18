import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContextStore } from '../src/common/tenant/tenant-context.store.js';
import { randomUUID } from 'crypto';

describe('Auth Module (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let testTenantId: string;
  let testApiKeyId: string;
  const testApiKey = 'wa_live_' + randomUUID().replace(/-/g, '').slice(0, 32);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication(new FastifyAdapter());
    prisma = app.get(PrismaService);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Create test tenant and API key
    testTenantId = randomUUID();
    const tenant = await prisma.tenant.create({
      data: {
        id: testTenantId,
        name: 'Test Tenant Auth',
        apiKey: 'wa_live_' + randomUUID().replace(/-/g, ''),
        maxSessions: 5,
        active: true,
      },
    });

    const apiKey = await prisma.apiKey.create({
      data: {
        key: testApiKey,
        tenantId: tenant.id,
        name: 'Test Key',
        isActive: true,
      },
    });
    testApiKeyId = apiKey.id;
  });

  afterAll(async () => {
    await prisma.apiKey
      .deleteMany({ where: { tenantId: testTenantId } })
      .catch(() => {});
    await prisma.tenant.delete({ where: { id: testTenantId } }).catch(() => {});
    await app.close();
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
    expect(prisma).toBeDefined();
  });

  it('GET /auth/keys returns API keys for tenant', async () => {
    TenantContextStore.set({ tenantId: testTenantId });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/keys',
      headers: { 'x-api-key': testApiKey },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('POST /auth/keys/deactivate/:id deactivates key', async () => {
    TenantContextStore.set({ tenantId: testTenantId });

    const response = await app.inject({
      method: 'POST',
      url: `/auth/keys/deactivate/${testApiKeyId}`,
      headers: { 'x-api-key': testApiKey },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as Record<string, unknown>;
    expect(data.isActive).toBe(false);
  });

  it('POST /auth/keys/activate/:id activates key', async () => {
    TenantContextStore.set({ tenantId: testTenantId });

    const response = await app.inject({
      method: 'POST',
      url: `/auth/keys/activate/${testApiKeyId}`,
      headers: { 'x-api-key': testApiKey },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as Record<string, unknown>;
    expect(data.isActive).toBe(true);
  });
});
