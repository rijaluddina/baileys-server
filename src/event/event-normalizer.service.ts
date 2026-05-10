import { Injectable, Logger } from '@nestjs/common';
import type { BaileysEventMap } from 'baileys';
import { EventBusService } from './event-bus.service.js';

export interface NormalizedEvent {
  type: string;
  sessionId: string;
  subType?: string;
  data: Record<string, unknown>;
  timestamp: Date;
  correlationId?: string;
}

@Injectable()
export class EventNormalizerService {
  private readonly logger = new Logger(EventNormalizerService.name);
  private readonly eventMapping = new Map<keyof BaileysEventMap, string>([
    ['connection.update', 'connection'],
    ['creds.update', 'auth'],
    ['messages.upsert', 'message'],
    ['messages.update', 'message_update'],
    ['messages.delete', 'message_delete'],
    ['messages.reaction', 'message_reaction'],
    ['message-receipt.update', 'receipt'],
    ['chats.upsert', 'chat'],
    ['chats.update', 'chat_update'],
    ['chats.delete', 'chat_delete'],
    ['contacts.upsert', 'contact'],
    ['contacts.update', 'contact_update'],
    ['groups.upsert', 'group'],
    ['groups.update', 'group_update'],
    ['group-participants.update', 'group_participant'],
    ['labels.edit', 'label'],
    ['labels.association', 'label_association'],
    ['call', 'call'],
    ['presence.update', 'presence'],
  ]);

  constructor(private readonly eventBus: EventBusService) {}

  normalizeBaileysEvent(
    event: keyof BaileysEventMap,
    data: unknown,
    sessionId: string,
  ): NormalizedEvent {
    const internalEventType = this.eventMapping.get(event) ?? event;
    const payload = this.transformPayload(event, data);

    const normalized: NormalizedEvent = {
      type: internalEventType,
      sessionId,
      subType: event,
      data: payload,
      timestamp: new Date(),
    };

    this.eventBus.publish({
      type: internalEventType,
      sessionId,
      data: normalized,
      timestamp: new Date(),
    });

    return normalized;
  }

  private transformPayload(
    event: keyof BaileysEventMap,
    data: unknown,
  ): Record<string, unknown> {
    const payload = data as Record<string, unknown>;

    switch (event) {
      case 'messages.upsert': {
        const messages =
          (payload['messages'] as Array<Record<string, unknown>>) ?? [];
        return {
          messageCount: messages.length,
          messageTypes: [
            ...new Set(
              messages.map((m) => m['message'] as string).filter(Boolean),
            ),
          ],
          fromMe: messages.some(
            (m) => m['key'] && (m['key'] as Record<string, unknown>)['fromMe'],
          ),
          hasMedia: messages.some((m) => {
            const msg = m['message'] as Record<string, unknown>;
            return (
              msg &&
              Object.keys(msg).some((k) =>
                [
                  'imageMessage',
                  'videoMessage',
                  'audioMessage',
                  'documentMessage',
                  'stickerMessage',
                ].includes(k),
              )
            );
          }),
        };
      }

      case 'connection.update': {
        return {
          connection: payload['connection'],
          isNewLogin: payload['isNewLogin'],
          isOnline: payload['isOnline'],
          qr: payload['qr'] ? '[QR_CODE]' : undefined,
        };
      }

      case 'group-participants.update': {
        return {
          groupJid: payload['id'],
          action: payload['action'],
          participantCount: Array.isArray(payload['participants'])
            ? payload['participants'].length
            : 0,
        };
      }

      case 'chats.update': {
        const updates = Array.isArray(payload) ? payload : [payload];
        return {
          updateCount: updates.length,
          hasUnread: updates.some((u) => u['unreadCount'] !== undefined),
          hasArchive: updates.some((u) => u['archive'] !== undefined),
        };
      }

      case 'contacts.update': {
        const updates = Array.isArray(payload) ? payload : [payload];
        return {
          contactCount: updates.length,
          hasImgUrlChange: updates.some((u) => u['imgUrl'] !== undefined),
        };
      }

      default:
        return payload;
    }
  }
}
