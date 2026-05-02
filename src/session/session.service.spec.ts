import { ConflictException } from '@nestjs/common';
import { SessionService } from './session.service';
import { usePrismaAuthState } from './prisma-auth-state';
import makeWASocket, { fetchLatestBaileysVersion } from '@whiskeysockets/baileys';

jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: jest.fn(),
  Browsers: {
    ubuntu: jest.fn(() => ['Ubuntu', 'Chrome', '1.0']),
  },
}));

jest.mock('./prisma-auth-state', () => ({
  usePrismaAuthState: jest.fn(),
}));

describe('SessionService', () => {
  const socket = {
    ev: { on: jest.fn() },
    end: jest.fn(),
  };

  function createService(prismaOverrides: Record<string, unknown> = {}) {
    const eventHandlers = new Map<string, (...args: any[]) => unknown>();
    socket.ev.on.mockImplementation((event: string, handler: (...args: any[]) => unknown) => {
      eventHandlers.set(event, handler);
    });

    const configService = {
      get: jest.fn((key: string) => (key === 'WEBHOOK_URL' ? 'https://example.test/webhook' : undefined)),
    };
    const eventEmitter = { emit: jest.fn() };
    const prisma = {
      session: {
        delete: jest.fn().mockResolvedValue(undefined),
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      message: {
        findFirst: jest.fn(),
      },
      ...prismaOverrides,
    };
    const queueService = {
      scheduleMessageCleanup: jest.fn(),
      addMessageStoreJob: jest.fn().mockResolvedValue(undefined),
      addContactSyncJob: jest.fn().mockResolvedValue(undefined),
      addChatSyncJob: jest.fn().mockResolvedValue(undefined),
      addWebhookDeliveryJob: jest.fn().mockResolvedValue(undefined),
    };

    return {
      service: new SessionService(
        configService as any,
        eventEmitter as any,
        prisma as any,
        queueService as any,
      ),
      prisma,
      eventHandlers,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (makeWASocket as jest.Mock).mockReturnValue(socket);
    (fetchLatestBaileysVersion as jest.Mock).mockResolvedValue({ version: [2, 3000, 0] });
    (usePrismaAuthState as jest.Mock).mockResolvedValue({
      state: { creds: {}, keys: {} },
      saveCreds: jest.fn(),
    });
  });

  it('upserts the session record without deleting existing persisted data', async () => {
    const { service, prisma } = createService();

    await service.createSession('session-1');

    expect(prisma.session.delete).not.toHaveBeenCalled();
    expect(prisma.session.upsert).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      create: {
        id: 'session-1',
        status: 'connecting',
        webhookUrl: 'https://example.test/webhook',
      },
      update: {
        status: 'connecting',
        webhookUrl: 'https://example.test/webhook',
      },
    });
  });

  it('still rejects duplicate in-memory sessions', async () => {
    const { service } = createService();
    await service.createSession('session-1');

    await expect(service.createSession('session-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a stored WhatsApp message for quoting', async () => {
    const storedMessage = {
      content: {
        key: {
          remoteJid: '6281234567890@s.whatsapp.net',
          id: 'message-1',
          fromMe: false,
        },
        message: { conversation: 'hello' },
      },
    };
    const { service, prisma } = createService({
      message: {
        findFirst: jest.fn().mockResolvedValue(storedMessage),
      },
    });

    await expect(
      service.findMessage('session-1', '6281234567890@s.whatsapp.net', 'message-1'),
    ).resolves.toEqual(storedMessage.content);

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        sessionId: 'session-1',
        remoteJid: '6281234567890@s.whatsapp.net',
        messageId: 'message-1',
      },
    });
  });

  it('does not reconnect a session after it has been deleted during retry delay', async () => {
    jest.useFakeTimers();
    const { service, eventHandlers } = createService();
    await service.createSession('session-1');

    const connectionHandler = eventHandlers.get('connection.update');
    expect(connectionHandler).toBeDefined();

    await connectionHandler?.({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 500 } } },
    });

    const reconnectSpy = jest.spyOn(service, 'createSession').mockResolvedValue({ sessionId: 'session-1', status: 'connecting' });

    await service.deleteSession('session-1');
    await jest.runOnlyPendingTimersAsync();

    expect(reconnectSpy).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
