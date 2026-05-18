import { SessionController } from './session.controller.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionService } from './session.service.js';
import { SessionDataService } from './session-data.service.js';

jest.mock('baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: jest.fn(),
  Browsers: {
    ubuntu: jest.fn(() => ['Ubuntu', 'Chrome', '1.0']),
  },
}));

type MockSessionService = Pick<SessionService, 'reconnectSession'>;
type MockSessionDataService = Pick<SessionDataService, never>;
type MockEventEmitter = Pick<EventEmitter2, 'on' | 'off'>;

jest.mock('./prisma-auth-state.js', () => ({
  usePrismaAuthState: jest.fn(),
}));

describe('SessionController', () => {
  it('delegates reconnect lifecycle to SessionService', async () => {
    const sessionService: MockSessionService = {
      reconnectSession: jest
        .fn()
        .mockResolvedValue({ sessionId: 'session-1', status: 'connecting' }),
    };
    const sessionDataService: MockSessionDataService = {};
    const eventEmitter: MockEventEmitter = {
      on: jest.fn(),
      off: jest.fn(),
    };
    const controller = new SessionController(
      sessionService as SessionService,
      sessionDataService as SessionDataService,
      eventEmitter as EventEmitter2,
    );

    await expect(controller.reconnect('session-1')).resolves.toEqual({
      sessionId: 'session-1',
      status: 'connecting',
    });

    expect(sessionService.reconnectSession).toHaveBeenCalledWith('session-1');
  });
});
