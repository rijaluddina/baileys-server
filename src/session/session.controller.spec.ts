/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { SessionController } from './session.controller.js';

jest.mock('baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: jest.fn(),
  Browsers: {
    ubuntu: jest.fn(() => ['Ubuntu', 'Chrome', '1.0']),
  },
}));

jest.mock('./prisma-auth-state.js', () => ({
  usePrismaAuthState: jest.fn(),
}));

describe('SessionController', () => {
  it('delegates reconnect lifecycle to SessionService', async () => {
    const sessionService = {
      reconnectSession: jest
        .fn()
        .mockResolvedValue({ sessionId: 'session-1', status: 'connecting' }),
    };
    const sessionDataService = {};
    const eventEmitter = { on: jest.fn(), off: jest.fn() };
    const controller = new SessionController(
      sessionService as any,
      sessionDataService as any,
      eventEmitter as any,
    );

    await expect(controller.reconnect('session-1')).resolves.toEqual({
      sessionId: 'session-1',
      status: 'connecting',
    });

    expect(sessionService.reconnectSession).toHaveBeenCalledWith('session-1');
  });
});
