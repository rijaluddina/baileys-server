/* eslint-disable @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-assignment */
import { SessionGateway } from './session.gateway.js';

describe('SessionGateway', () => {
  let gateway: SessionGateway;
  let mockServer: { to: jest.Mock; emit: jest.Mock };
  let mockLogger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let mockConfigService: { get: jest.Mock };

  const createMockSocket = (overrides = {}) => ({
    id: 'socket-123',
    handshake: {
      auth: { token: '' },
      headers: {},
      query: {},
    },
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockConfigService = { get: jest.fn() };

    gateway = new SessionGateway(mockConfigService as any);
    gateway.server = mockServer as any;
    Object.defineProperty(gateway, 'logger', {
      value: mockLogger,
      writable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('without API_KEY configured - allows connection without auth', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const client = createMockSocket();

      gateway.handleConnection(client as any);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });

    it('with valid API_KEY from auth.token - allows connection with correct token', () => {
      const validToken = 'valid-api-key';
      mockConfigService.get.mockReturnValue(validToken);
      const client = createMockSocket({
        handshake: {
          auth: { token: validToken },
          headers: {},
          query: {},
        },
      });

      gateway.handleConnection(client as any);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });

    it('with valid API_KEY from x-api-key header - allows connection with correct header', () => {
      const validToken = 'valid-api-key';
      mockConfigService.get.mockReturnValue(validToken);
      const client = createMockSocket({
        handshake: {
          auth: {},
          headers: { 'x-api-key': validToken },
          query: {},
        },
      });

      gateway.handleConnection(client as any);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });

    it('with invalid API_KEY - emits error and disconnects', () => {
      mockConfigService.get.mockReturnValue('correct-api-key');
      const client = createMockSocket({
        handshake: {
          auth: { token: 'wrong-api-key' },
          headers: {},
          query: {},
        },
      });

      gateway.handleConnection(client as any);

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized',
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('with missing API_KEY when required - emits error and disconnects', () => {
      mockConfigService.get.mockReturnValue('required-api-key');
      const client = createMockSocket({
        handshake: {
          auth: {},
          headers: {},
          query: {},
        },
      });

      gateway.handleConnection(client as any);

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized',
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('with sessionId in query - client joins the session room', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const client = createMockSocket({
        handshake: {
          auth: {},
          headers: {},
          query: { sessionId: 'session-1' },
        },
      });

      gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('session-1');
    });

    it('without sessionId - client does not join any room', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const client = createMockSocket({
        handshake: {
          auth: {},
          headers: {},
          query: {},
        },
      });

      gateway.handleConnection(client as any);

      expect(client.join).not.toHaveBeenCalled();
    });

    it('logs client ID on connection', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const client = createMockSocket();

      gateway.handleConnection(client as any);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Client connected: socket-123',
      );
    });
  });

  describe('handleDisconnect', () => {
    it('logs client ID on disconnect', () => {
      const client = createMockSocket();

      gateway.handleDisconnect(client as any);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Client disconnected: socket-123',
      );
    });
  });

  describe('event handlers', () => {
    describe('session.qr', () => {
      it('emits qr to sessionId room', () => {
        const payload = { sessionId: 'session-1', qr: 'test-qr-data' };

        gateway.handleQr(payload);

        expect(mockServer.to).toHaveBeenCalledWith('session-1');
        expect(mockServer.emit).toHaveBeenCalledWith('qr', payload);
      });
    });

    describe('session.pairing-code', () => {
      it('emits pairing-code to sessionId room', () => {
        const payload = { sessionId: 'session-1', pairingCode: '123-456' };

        gateway.handlePairingCode(payload);

        expect(mockServer.to).toHaveBeenCalledWith('session-1');
        expect(mockServer.emit).toHaveBeenCalledWith('pairing-code', payload);
      });
    });

    describe('session.connected', () => {
      it('emits connected to sessionId room', () => {
        const payload = { sessionId: 'session-1', user: { id: 'user-1' } };

        gateway.handleConnected(payload);

        expect(mockServer.to).toHaveBeenCalledWith('session-1');
        expect(mockServer.emit).toHaveBeenCalledWith('connected', payload);
      });
    });

    describe('session.logged-out', () => {
      it('emits logged-out to sessionId room', () => {
        const payload = { sessionId: 'session-1' };

        gateway.handleLoggedOut(payload);

        expect(mockServer.to).toHaveBeenCalledWith('session-1');
        expect(mockServer.emit).toHaveBeenCalledWith('logged-out', payload);
      });
    });

    describe('baileys.* event', () => {
      it('emits baileys-event to sessionId room', () => {
        const payload = { sessionId: 'session-1', data: { type: 'update' } };

        gateway.handleBaileysEvent(payload);

        expect(mockServer.to).toHaveBeenCalledWith('session-1');
        expect(mockServer.emit).toHaveBeenCalledWith('baileys-event', payload);
      });
    });
  });
});
