import axios from 'axios';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor.js';

jest.mock('axios');

type WebhookJob = {
  sessionId: string;
  webhookUrl: string;
  event: string;
  data: { ok: boolean };
  timestamp: string;
};

type MockPrisma = {
  webhookLog: {
    create: jest.Mock;
  };
};
type MockConfigService = Pick<ConfigService, 'get'>;

describe('WebhookDeliveryProcessor', () => {
  const mockedAxios = jest.mocked(axios);
  const job = {
    data: {
      sessionId: 'session-1',
      webhookUrl: 'https://example.test/webhook',
      event: 'messages.upsert',
      data: { ok: true },
      timestamp: '2026-05-02T00:00:00.000Z',
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as Job<WebhookJob>;

  it('does not fail a delivered webhook when writing the success log fails', async () => {
    mockedAxios.post.mockResolvedValue({ status: 204 });
    const prisma: MockPrisma = {
      webhookLog: {
        create: jest.fn().mockRejectedValue(new Error('db unavailable')),
      },
    };
    const configService: MockConfigService = {
      get: jest.fn(() => ''),
    };
    const processor = new WebhookDeliveryProcessor(
      prisma as PrismaService,
      configService as ConfigService,
    );

    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(prisma.webhookLog.create).toHaveBeenCalled();
  });
});
