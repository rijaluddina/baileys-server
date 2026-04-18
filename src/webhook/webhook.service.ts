import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

interface WebhookPayload {
  sessionId: string;
  webhookUrl: string;
  event: string;
  data: unknown;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly secret: string;

  constructor(private configService: ConfigService) {
    this.secret = this.configService.get<string>('WEBHOOK_SECRET') || '';
  }

  @OnEvent('webhook.deliver')
  async handleWebhookDelivery(payload: WebhookPayload) {
    if (!payload.webhookUrl) return;

    const body = {
      sessionId: payload.sessionId,
      event: payload.event,
      data: payload.data,
      timestamp: new Date().toISOString(),
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
      await axios.post(payload.webhookUrl, body, {
        headers,
        timeout: 10000,
      });
      this.logger.debug(`Webhook delivered: ${payload.event} → ${payload.webhookUrl}`);
    } catch (error: any) {
      this.logger.error(
        `Webhook delivery failed: ${payload.event} → ${payload.webhookUrl}: ${error.message}`,
      );
    }
  }
}
