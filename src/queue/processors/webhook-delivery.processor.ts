import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import axios from 'axios';
import * as crypto from 'crypto';
import type { Prisma } from '../../generated/prisma/client/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_NAMES } from '../queue.constants.js';

interface WebhookJob {
  sessionId: string;
  webhookUrl: string;
  event: string;
  data: unknown;
  timestamp: string;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
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

      await this.createWebhookLog({
        data: {
          sessionId,
          event,
          url: webhookUrl,
          payload: toInputJson(body),
          statusCode: response.status,
          success: true,
          attempts: job.attemptsMade + 1,
        },
      });

      this.logger.debug(`Webhook delivered: ${event} → ${webhookUrl} (${response.status})`);
    } catch (error: unknown) {
      const statusCode = axios.isAxiosError(error) ? (error.response?.status ?? null) : null;
      const errorMessage = getErrorMessage(error);
      const responseData = axios.isAxiosError(error) ? error.response?.data : undefined;

      await this.createWebhookLog({
        data: {
          sessionId,
          event,
          url: webhookUrl,
          payload: toInputJson(body),
          statusCode,
          success: false,
          error: errorMessage,
          response: responseData
            ? JSON.stringify(responseData).slice(0, 2000)
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

  private async createWebhookLog(args: Parameters<PrismaService['webhookLog']['create']>[0]) {
    try {
      await this.prisma.webhookLog.create(args);
    } catch (error: unknown) {
      this.logger.error(`Failed to write webhook log: ${getErrorMessage(error)}`);
    }
  }
}
