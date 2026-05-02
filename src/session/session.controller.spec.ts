import { SessionController } from './session.controller';

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

describe('SessionController', () => {
  it('delegates reconnect lifecycle to SessionService', async () => {
    const sessionService = {
      reconnectSession: jest.fn().mockResolvedValue({ sessionId: 'session-1', status: 'connecting' }),
    };
    const controller = new SessionController(sessionService as any);

    await expect(controller.reconnect('session-1')).resolves.toEqual({
      sessionId: 'session-1',
      status: 'connecting',
    });

    expect(sessionService.reconnectSession).toHaveBeenCalledWith('session-1');
  });
});
