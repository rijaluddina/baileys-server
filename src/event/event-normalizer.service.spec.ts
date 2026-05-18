/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { EventNormalizerService } from './event-normalizer.service.js';
import { EventBusService } from './event-bus.service.js';

describe('EventNormalizerService', () => {
  let service: EventNormalizerService;
  let mockEventBus: { publish: jest.Mock };

  beforeEach(() => {
    mockEventBus = { publish: jest.fn() };
    service = new EventNormalizerService(
      mockEventBus as unknown as EventBusService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeBaileysEvent', () => {
    it('should map known event types to internal types', () => {
      const result = service.normalizeBaileysEvent(
        'connection.update',
        { connection: 'open' },
        'session-1',
      );

      expect(result.type).toBe('connection');
      expect(result.subType).toBe('connection.update');
    });

    it('should map messages.upsert to message type', () => {
      const result = service.normalizeBaileysEvent(
        'messages.upsert',
        { messages: [] },
        'session-1',
      );

      expect(result.type).toBe('message');
      expect(result.subType).toBe('messages.upsert');
    });

    it('should fall back to original event type for unknown events', () => {
      const result = service.normalizeBaileysEvent(
        'unknown.event' as keyof import('baileys').BaileysEventMap,
        { data: 'test' },
        'session-1',
      );

      expect(result.type).toBe('unknown.event');
    });

    it('should publish to eventBus with normalized event', () => {
      service.normalizeBaileysEvent(
        'connection.update',
        { connection: 'open' },
        'session-123',
      );

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'connection',
          sessionId: 'session-123',
        }),
      );
    });

    it('should include subType with original event type', () => {
      const result = service.normalizeBaileysEvent(
        'chats.update',
        [],
        'session-1',
      );

      expect(result.subType).toBe('chats.update');
    });

    describe('transformPayload for messages.upsert', () => {
      it('should extract messageCount', () => {
        const messages = [
          { message: 'text1' },
          { message: 'text2' },
          { message: 'text3' },
        ];

        const result = service.normalizeBaileysEvent(
          'messages.upsert',
          { messages },
          'session-1',
        );

        expect(result.data.messageCount).toBe(3);
      });

      it('should extract messageTypes', () => {
        const messages = [
          { message: 'textMessage' },
          { message: 'imageMessage' },
          { message: 'textMessage' },
          { message: 'videoMessage' },
        ];

        const result = service.normalizeBaileysEvent(
          'messages.upsert',
          { messages },
          'session-1',
        );

        expect(result.data.messageTypes).toContain('textMessage');
        expect(result.data.messageTypes).toContain('imageMessage');
        expect(result.data.messageTypes).toContain('videoMessage');
        expect(result.data.messageTypes).toHaveLength(3);
      });

      it('should detect fromMe messages', () => {
        const messages = [
          { key: { fromMe: true } },
          { key: { fromMe: false } },
        ];

        const result = service.normalizeBaileysEvent(
          'messages.upsert',
          { messages },
          'session-1',
        );

        expect(result.data.fromMe).toBe(true);
      });

      it('should detect hasMedia', () => {
        const messages = [
          { message: 'textMessage' },
          { message: { imageMessage: {} } },
        ];

        const result = service.normalizeBaileysEvent(
          'messages.upsert',
          { messages },
          'session-1',
        );

        expect(result.data.hasMedia).toBe(true);
      });

      it('should return hasMedia false when no media', () => {
        const messages = [{ message: 'textMessage' }];

        const result = service.normalizeBaileysEvent(
          'messages.upsert',
          { messages },
          'session-1',
        );

        expect(result.data.hasMedia).toBe(false);
      });

      it('should handle missing messages array', () => {
        const result = service.normalizeBaileysEvent(
          'messages.upsert',
          {},
          'session-1',
        );

        expect(result.data.messageCount).toBe(0);
        expect(result.data.hasMedia).toBe(false);
      });
    });

    describe('transformPayload for connection.update', () => {
      it('should extract connection state', () => {
        const result = service.normalizeBaileysEvent(
          'connection.update',
          { connection: 'open' },
          'session-1',
        );

        expect(result.data.connection).toBe('open');
      });

      it('should extract isNewLogin', () => {
        const result = service.normalizeBaileysEvent(
          'connection.update',
          { connection: 'open', isNewLogin: true },
          'session-1',
        );

        expect(result.data.isNewLogin).toBe(true);
      });

      it('should extract isOnline', () => {
        const result = service.normalizeBaileysEvent(
          'connection.update',
          { connection: 'open', isOnline: false },
          'session-1',
        );

        expect(result.data.isOnline).toBe(false);
      });

      it('should mask qr code', () => {
        const result = service.normalizeBaileysEvent(
          'connection.update',
          { connection: 'connecting', qr: 'some-qr-data' },
          'session-1',
        );

        expect(result.data.qr).toBe('[QR_CODE]');
      });

      it('should not include qr when not present', () => {
        const result = service.normalizeBaileysEvent(
          'connection.update',
          { connection: 'open' },
          'session-1',
        );

        expect(result.data.qr).toBeUndefined();
      });
    });

    describe('transformPayload for group-participants.update', () => {
      it('should extract groupJid', () => {
        const result = service.normalizeBaileysEvent(
          'group-participants.update',
          {
            id: 'group@newsletter.com',
            action: 'add',
            participants: ['a', 'b'],
          },
          'session-1',
        );

        expect(result.data.groupJid).toBe('group@newsletter.com');
      });

      it('should extract action', () => {
        const result = service.normalizeBaileysEvent(
          'group-participants.update',
          { id: 'group@newsletter.com', action: 'remove', participants: ['a'] },
          'session-1',
        );

        expect(result.data.action).toBe('remove');
      });

      it('should extract participantCount', () => {
        const result = service.normalizeBaileysEvent(
          'group-participants.update',
          {
            id: 'group@newsletter.com',
            action: 'add',
            participants: ['a', 'b', 'c'],
          },
          'session-1',
        );

        expect(result.data.participantCount).toBe(3);
      });

      it('should return 0 participants when not array', () => {
        const result = service.normalizeBaileysEvent(
          'group-participants.update',
          {
            id: 'group@newsletter.com',
            action: 'add',
            participants: 'not-array',
          },
          'session-1',
        );

        expect(result.data.participantCount).toBe(0);
      });
    });

    describe('transformPayload for chats.update', () => {
      it('should extract updateCount', () => {
        const updates = [{ archive: true }, { unreadCount: 5 }];

        const result = service.normalizeBaileysEvent(
          'chats.update',
          updates,
          'session-1',
        );

        expect(result.data.updateCount).toBe(2);
      });

      it('should detect hasUnread', () => {
        const result = service.normalizeBaileysEvent(
          'chats.update',
          [{ archive: true }, { unreadCount: 5 }],
          'session-1',
        );

        expect(result.data.hasUnread).toBe(true);
      });

      it('should detect hasArchive', () => {
        const result = service.normalizeBaileysEvent(
          'chats.update',
          [{ archive: true }, { unreadCount: 0 }],
          'session-1',
        );

        expect(result.data.hasArchive).toBe(true);
      });

      it('should handle single object instead of array', () => {
        const result = service.normalizeBaileysEvent(
          'chats.update',
          { archive: true },
          'session-1',
        );

        expect(result.data.updateCount).toBe(1);
        expect(result.data.hasArchive).toBe(true);
      });
    });

    describe('transformPayload for contacts.update', () => {
      it('should extract contactCount', () => {
        const updates = [{ id: '1' }, { id: '2' }, { id: '3' }];

        const result = service.normalizeBaileysEvent(
          'contacts.update',
          updates,
          'session-1',
        );

        expect(result.data.contactCount).toBe(3);
      });

      it('should detect hasImgUrlChange', () => {
        const result = service.normalizeBaileysEvent(
          'contacts.update',
          [{ id: '1', imgUrl: 'http://example.com/img.jpg' }],
          'session-1',
        );

        expect(result.data.hasImgUrlChange).toBe(true);
      });

      it('should handle single object instead of array', () => {
        const result = service.normalizeBaileysEvent(
          'contacts.update',
          { id: '1' },
          'session-1',
        );

        expect(result.data.contactCount).toBe(1);
        expect(result.data.hasImgUrlChange).toBe(false);
      });
    });

    describe('unknown events', () => {
      it('should return payload as-is for unmapped events', () => {
        const payload = { custom: 'data', nested: { value: 123 } };

        const result = service.normalizeBaileysEvent(
          'custom.unmapped.event' as any,
          payload,
          'session-1',
        );

        expect(result.data).toEqual(payload);
      });
    });
  });

  describe('event mapping coverage', () => {
    const eventMappings = [
      { input: 'connection.update', expected: 'connection' },
      { input: 'creds.update', expected: 'auth' },
      { input: 'messages.upsert', expected: 'message' },
      { input: 'messages.update', expected: 'message_update' },
      { input: 'messages.delete', expected: 'message_delete' },
      { input: 'messages.reaction', expected: 'message_reaction' },
      { input: 'message-receipt.update', expected: 'receipt' },
      { input: 'chats.upsert', expected: 'chat' },
      { input: 'chats.update', expected: 'chat_update' },
      { input: 'chats.delete', expected: 'chat_delete' },
      { input: 'contacts.upsert', expected: 'contact' },
      { input: 'contacts.update', expected: 'contact_update' },
      { input: 'groups.upsert', expected: 'group' },
      { input: 'groups.update', expected: 'group_update' },
      { input: 'group-participants.update', expected: 'group_participant' },
      { input: 'labels.edit', expected: 'label' },
      { input: 'labels.association', expected: 'label_association' },
      { input: 'call', expected: 'call' },
      { input: 'presence.update', expected: 'presence' },
    ] as const;

    eventMappings.forEach(({ input, expected }) => {
      it(`should map ${input} to ${expected}`, () => {
        const result = service.normalizeBaileysEvent(input, {}, 'session-1');
        expect(result.type).toBe(expected);
      });
    });
  });
});
