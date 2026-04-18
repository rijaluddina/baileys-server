import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_NAMES } from '../queue.constants.js';

interface WebhookJob {
  sessionId: string;
  webhookUrl: string;
  event: string;
  data: unknown;
  timestamp: string;
}

@Processor(QUEUE_NAMES.WEBHOOK_DELIVERY)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super();
    this.secret = this.configService.get<string>('WEBHOOK_SECRET') || '';
  }

  async process(job: Job<WebhookJob>): Promise<void> {
    const { sessionId, webhookUrl, event, data, timestamp } = job.data;

    if (!webhookUrl) return;

    const body = {
      sessionId,
      event,
      data,
      timestamp,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add HMAC signature if secret is configured
    if (this.secret) {
      const signature = crypto
        .createHmac('sha256', this.secret)
        .update(JSON.stringify(body))
        .digest('hex');
      headers['x-webhook-signature'] = signature;
    }

    try {
      const response = await axios.post(webhookUrl, body, {
        headers,
        timeout: 15000,
      });

      // Log successful delivery
      await this.prisma.webhookLog.create({
        data: {
          sessionId,
          event,
          url: webhookUrl,
          payload: body as any,
          statusCode: response.status,
          success: true,
          attempts: job.attemptsMade + 1,
        },
      });

      this.logger.debug(`Webhook delivered: ${event} → ${webhookUrl} (${response.status})`);
    } catch (error: any) {
      const statusCode = error.response?.status ?? null;
      const errorMessage = error.message || 'Unknown error';

      // Log failed delivery
      await this.prisma.webhookLog.create({
        data: {
          sessionId,
          event,
          url: webhookUrl,
          payload: body as any,
          statusCode,
          success: false,
          error: errorMessage,
          response: error.response?.data
            ? JSON.stringify(error.response.data).slice(0, 2000)
            : null,
          attempts: job.attemptsMade + 1,
        },
      });

      this.logger.error(
        `Webhook failed (attempt ${job.attemptsMade + 1}/${job.opts.attempts}): ${event} → ${webhookUrl}: ${errorMessage}`,
      );

      // Re-throw so BullMQ retries
      throw error;
    }
  }
}
