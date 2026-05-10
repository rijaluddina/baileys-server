/* eslint-disable @typescript-eslint/no-unsafe-argument */
jest.mock('baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: jest.fn(),
  Browsers: {
    ubuntu: jest.fn(() => ['Ubuntu', 'Chrome', '1.0']),
  },
}));

jest.mock('../session/prisma-auth-state.js', () => ({
  usePrismaAuthState: jest.fn(),
}));

import { MessagingService } from './messaging.service.js';

describe('MessagingService', () => {
  it('awaits quoted message lookup before sending text replies', async () => {
    const socket = {
      sendMessage: jest.fn().mockResolvedValue({ key: { id: 'sent-1' } }),
    };
    const quoted = {
      key: {
        remoteJid: '6281234567890@s.whatsapp.net',
        id: 'quoted-1',
      },
      message: { conversation: 'quoted text' },
    };
    const sessionService = {
      getSocket: jest.fn().mockReturnValue(socket),
    };
    const sessionDataService = {
      findMessage: jest.fn().mockResolvedValue(quoted),
    };
    const queueService = {};
    const service = new MessagingService(
      sessionService as any,
      sessionDataService as any,
      queueService as any,
    );

    await expect(
      service.sendText('session-1', {
        to: '6281234567890',
        text: 'reply',
        quotedMessageId: 'quoted-1',
      }),
    ).resolves.toEqual({ messageId: 'sent-1', status: 'sent' });

    expect(sessionDataService.findMessage).toHaveBeenCalledWith(
      'session-1',
      '6281234567890@s.whatsapp.net',
      'quoted-1',
    );
    expect(socket.sendMessage).toHaveBeenCalledWith(
      '6281234567890@s.whatsapp.net',
      { text: 'reply' },
      { quoted },
    );
  });
});
