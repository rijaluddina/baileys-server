import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * WebhookService is now a thin listener.
 * Actual delivery is handled by the WebhookDeliveryProcessor via BullMQ.
 * Webhook events are enqueued directly by SessionService.emitWebhook().
 *
 * This service remains for any custom event-driven webhook logic.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  /**
   * Legacy handler — kept for backwards compatibility.
   * In the new architecture, webhooks are enqueued by SessionService directly.
   * This handler is a no-op if webhooks are already queued.
   */
  @OnEvent('webhook.deliver.legacy')
  async handleLegacyWebhookDelivery(payload: {
    sessionId: string;
    webhookUrl: string;
    event: string;
    data: unknown;
  }) {
    // No-op: all webhook delivery is now handled via BullMQ queue.
    // This event name is intentionally different to avoid conflicts.
    this.logger.debug(`Legacy webhook event received for ${payload.sessionId}:${payload.event}`);
  }
}
