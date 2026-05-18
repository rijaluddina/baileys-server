import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantContextStore } from '../src/common/tenant/tenant-context.store.js';
import { randomUUID } from 'crypto';

describe('Capability Module (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let testTenantId: string;
  let testSessionId: string;

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
        name: 'Test Tenant Capability',
        apiKey: 'wa_live_' + randomUUID().replace(/-/g, ''),
        maxSessions: 5,
        active: true,
      },
    });

    // Get or create a test session without tenantId (using existing schema)
    const existingSession = await prisma.session.findFirst();
    if (existingSession) {
      testSessionId = existingSession.id;
    } else {
      testSessionId = randomUUID();
      await prisma.session.create({
        data: {
          id: testSessionId,
          status: 'created',
        },
      });
    }
  });

  afterAll(async () => {
    // Cleanup only if we created the session
    const session = await prisma.session.findUnique({
      where: { id: testSessionId },
    });
    if (session && !session.userJid) {
      await prisma.session
        .delete({ where: { id: testSessionId } })
        .catch(() => {});
    }
    await prisma.tenant.delete({ where: { id: testTenantId } }).catch(() => {});
    await app.close();
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
    expect(prisma).toBeDefined();
  });

  it('GET /capabilities/:sessionId returns capabilities', async () => {
    TenantContextStore.set({ tenantId: testTenantId });

    const response = await app.inject({
      method: 'GET',
      url: `/capabilities/${testSessionId}`,
      headers: { 'x-api-key': 'test-key' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /capabilities/:sessionId/:capabilityName checks capability', async () => {
    TenantContextStore.set({ tenantId: testTenantId });

    const response = await app.inject({
      method: 'GET',
      url: `/capabilities/${testSessionId}/send_message`,
      headers: { 'x-api-key': 'test-key' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as Record<string, unknown>;
    expect(typeof data.hasCapability).toBe('boolean');
  });

  it('POST /capabilities/:sessionId/:capabilityName enables capability', async () => {
    TenantContextStore.set({ tenantId: testTenantId });

    const response = await app.inject({
      method: 'POST',
      url: `/capabilities/${testSessionId}/make_call`,
      headers: { 'x-api-key': 'test-key' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as Record<string, unknown>;
    expect(data.success).toBe(true);
  });

  it('DELETE /capabilities/:sessionId/:capabilityName disables capability', async () => {
    TenantContextStore.set({ tenantId: testTenantId });

    const response = await app.inject({
      method: 'DELETE',
      url: `/capabilities/${testSessionId}/make_call`,
      headers: { 'x-api-key': 'test-key' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload) as Record<string, unknown>;
    expect(data.success).toBe(true);
  });
});
