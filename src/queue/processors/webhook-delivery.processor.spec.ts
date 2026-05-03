import axios from 'axios';
import { Job } from 'bullmq';
import {
  WebhookDeliveryProcessor,
  WebhookJob,
} from './webhook-delivery.processor.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';

jest.mock('axios');

describe('WebhookDeliveryProcessor', () => {
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
  } as unknown as Job<WebhookJob>;

  it('does not fail a delivered webhook when writing the success log fails', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ status: 204 });
    const prisma = {
      webhookLog: {
        create: jest.fn().mockRejectedValue(new Error('db unavailable')),
      },
    };
    const processor = new WebhookDeliveryProcessor(
      prisma as unknown as PrismaService,
      { get: jest.fn(() => '') } as unknown as ConfigService,
    );

    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(prisma.webhookLog.create).toHaveBeenCalled();
  });
});
