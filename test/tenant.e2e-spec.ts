import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContextStore } from '../src/common/tenant/tenant-context.store.js';
import { randomUUID } from 'crypto';

describe('Tenant Module (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let testTenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication(new FastifyAdapter());
    prisma = app.get(PrismaService);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Create test tenant
    testTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: testTenantId,
        name: 'Test Tenant',
        apiKey: 'wa_live_' + randomUUID().replace(/-/g, ''),
        maxSessions: 5,
        active: true,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.tenant.delete({ where: { id: testTenantId } }).catch(() => {});
    await app.close();
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
    expect(prisma).toBeDefined();
  });

  it('GET /tenants/:id returns tenant', async () => {
    TenantContextStore.set({ tenantId: testTenantId });

    const response = await app.inject({
      method: 'GET',
      url: `/tenants/${testTenantId}`,
      headers: { 'x-api-key': 'test-key' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as Record<string, unknown>;
    expect(data.id).toBe(testTenantId);
    expect(data.name).toBe('Test Tenant');
  });

  it('GET /tenants returns tenant list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { 'x-api-key': 'test-key' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });

  it('PATCH /tenants/:id updates tenant', async () => {
    TenantContextStore.set({ tenantId: testTenantId });

    const response = await app.inject({
      method: 'PATCH',
      url: `/tenants/${testTenantId}`,
      headers: { 'x-api-key': 'test-key' },
      payload: { name: 'Updated Tenant Name' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as Record<string, unknown>;
    expect(data.name).toBe('Updated Tenant Name');
  });
});
