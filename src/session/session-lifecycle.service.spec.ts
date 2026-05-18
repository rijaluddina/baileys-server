import { EventEmitter2 } from '@nestjs/event-emitter';
import { DisconnectReason } from 'baileys';
import {
  SessionLifecycleService,
  SessionStatus,
} from './session-lifecycle.service.js';

jest.mock('baileys', () => ({
  DisconnectReason: { loggedOut: 401 },
}));

describe('SessionLifecycleService', () => {
  let service: SessionLifecycleService;
  let mockEventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    mockEventEmitter = { emit: jest.fn() };
    service = new SessionLifecycleService(
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInitialStatus', () => {
    it('should return CREATED as initial status', () => {
      expect(service.getInitialStatus()).toBe(SessionStatus.CREATED);
    });
  });

  describe('getNextStatus', () => {
    describe('CREATED transitions', () => {
      it('should transition from CREATED to INITIALIZING via start', () => {
        expect(service.getNextStatus(SessionStatus.CREATED, 'start')).toBe(
          SessionStatus.INITIALIZING,
        );
      });
    });

    describe('INITIALIZING transitions', () => {
      it('should transition from INITIALIZING to QR_READY via qr', () => {
        expect(service.getNextStatus(SessionStatus.INITIALIZING, 'qr')).toBe(
          SessionStatus.QR_READY,
        );
      });

      it('should transition from INITIALIZING to PAIRING_READY via pairing_code', () => {
        expect(
          service.getNextStatus(SessionStatus.INITIALIZING, 'pairing_code'),
        ).toBe(SessionStatus.PAIRING_READY);
      });

      it('should transition from INITIALIZING to DISCONNECTED via disconnected', () => {
        expect(
          service.getNextStatus(SessionStatus.INITIALIZING, 'disconnected'),
        ).toBe(SessionStatus.DISCONNECTED);
      });

      it('should transition from INITIALIZING to DISCONNECTED via timeout', () => {
        expect(
          service.getNextStatus(SessionStatus.INITIALIZING, 'timeout'),
        ).toBe(SessionStatus.DISCONNECTED);
      });
    });

    describe('QR_READY transitions', () => {
      it('should transition from QR_READY to AUTHENTICATED via authenticated', () => {
        expect(
          service.getNextStatus(SessionStatus.QR_READY, 'authenticated'),
        ).toBe(SessionStatus.AUTHENTICATED);
      });

      it('should transition from QR_READY to QR_EXPIRED via timeout', () => {
        expect(service.getNextStatus(SessionStatus.QR_READY, 'timeout')).toBe(
          SessionStatus.QR_EXPIRED,
        );
      });

      it('should transition from QR_READY to DISCONNECTED via disconnected', () => {
        expect(
          service.getNextStatus(SessionStatus.QR_READY, 'disconnected'),
        ).toBe(SessionStatus.DISCONNECTED);
      });
    });

    describe('PAIRING_READY transitions', () => {
      it('should transition from PAIRING_READY to AUTHENTICATED via authenticated', () => {
        expect(
          service.getNextStatus(SessionStatus.PAIRING_READY, 'authenticated'),
        ).toBe(SessionStatus.AUTHENTICATED);
      });

      it('should transition from PAIRING_READY to PAIRING_EXPIRED via timeout', () => {
        expect(
          service.getNextStatus(SessionStatus.PAIRING_READY, 'timeout'),
        ).toBe(SessionStatus.PAIRING_EXPIRED);
      });

      it('should transition from PAIRING_READY to DISCONNECTED via disconnected', () => {
        expect(
          service.getNextStatus(SessionStatus.PAIRING_READY, 'disconnected'),
        ).toBe(SessionStatus.DISCONNECTED);
      });
    });

    describe('AUTHENTICATED transitions', () => {
      it('should transition from AUTHENTICATED to CONNECTED via connected', () => {
        expect(
          service.getNextStatus(SessionStatus.AUTHENTICATED, 'connected'),
        ).toBe(SessionStatus.CONNECTED);
      });

      it('should transition from AUTHENTICATED to DISCONNECTED via disconnected', () => {
        expect(
          service.getNextStatus(SessionStatus.AUTHENTICATED, 'disconnected'),
        ).toBe(SessionStatus.DISCONNECTED);
      });
    });

    describe('CONNECTED transitions', () => {
      it('should transition from CONNECTED to RECONNECTING via disconnected', () => {
        expect(
          service.getNextStatus(SessionStatus.CONNECTED, 'disconnected'),
        ).toBe(SessionStatus.RECONNECTING);
      });

      it('should transition from CONNECTED to DISCONNECTED via logged_out', () => {
        expect(
          service.getNextStatus(SessionStatus.CONNECTED, 'logged_out'),
        ).toBe(SessionStatus.DISCONNECTED);
      });

      it('should transition from CONNECTED to DESTROYED via destroy', () => {
        expect(service.getNextStatus(SessionStatus.CONNECTED, 'destroy')).toBe(
          SessionStatus.DESTROYED,
        );
      });
    });

    describe('RECONNECTING transitions', () => {
      it('should transition from RECONNECTING to CONNECTED via connected', () => {
        expect(
          service.getNextStatus(SessionStatus.RECONNECTING, 'connected'),
        ).toBe(SessionStatus.CONNECTED);
      });

      it('should transition from RECONNECTING to DISCONNECTED via disconnected', () => {
        expect(
          service.getNextStatus(SessionStatus.RECONNECTING, 'disconnected'),
        ).toBe(SessionStatus.DISCONNECTED);
      });

      it('should transition from RECONNECTING to DISCONNECTED via max_retries', () => {
        expect(
          service.getNextStatus(SessionStatus.RECONNECTING, 'max_retries'),
        ).toBe(SessionStatus.DISCONNECTED);
      });
    });

    describe('QR_EXPIRED transitions', () => {
      it('should transition from QR_EXPIRED to INITIALIZING via restart', () => {
        expect(service.getNextStatus(SessionStatus.QR_EXPIRED, 'restart')).toBe(
          SessionStatus.INITIALIZING,
        );
      });
    });

    describe('PAIRING_EXPIRED transitions', () => {
      it('should transition from PAIRING_EXPIRED to INITIALIZING via restart', () => {
        expect(
          service.getNextStatus(SessionStatus.PAIRING_EXPIRED, 'restart'),
        ).toBe(SessionStatus.INITIALIZING);
      });
    });

    describe('DISCONNECTED transitions', () => {
      it('should transition from DISCONNECTED to INITIALIZING via restart', () => {
        expect(
          service.getNextStatus(SessionStatus.DISCONNECTED, 'restart'),
        ).toBe(SessionStatus.INITIALIZING);
      });

      it('should transition from DISCONNECTED to DESTROYED via destroy', () => {
        expect(
          service.getNextStatus(SessionStatus.DISCONNECTED, 'destroy'),
        ).toBe(SessionStatus.DESTROYED);
      });

      it('should transition from DISCONNECTED to DESTROYED via logged_out', () => {
        expect(
          service.getNextStatus(SessionStatus.DISCONNECTED, 'logged_out'),
        ).toBe(SessionStatus.DESTROYED);
      });
    });

    describe('DESTROYED transitions', () => {
      it('should remain in DESTROYED for any trigger', () => {
        const triggers = [
          'start',
          'qr',
          'pairing_code',
          'authenticated',
          'connected',
          'disconnected',
          'logged_out',
          'destroy',
          'timeout',
          'max_retries',
          'restart',
        ] as const;
        triggers.forEach((trigger) => {
          expect(service.getNextStatus(SessionStatus.DESTROYED, trigger)).toBe(
            SessionStatus.DESTROYED,
          );
        });
      });
    });

    describe('invalid transitions', () => {
      it('should return current status for invalid trigger', () => {
        expect(service.getNextStatus(SessionStatus.CREATED, 'connected')).toBe(
          SessionStatus.CREATED,
        );
      });

      it('should return current status for qr trigger from CREATED', () => {
        expect(service.getNextStatus(SessionStatus.CREATED, 'qr')).toBe(
          SessionStatus.CREATED,
        );
      });
    });
  });

  describe('transition', () => {
    it('should record state in history', () => {
      const state = service.transition(
        'session-1',
        SessionStatus.CREATED,
        SessionStatus.INITIALIZING,
        'test-reason',
      );

      const history = service.getHistory('session-1');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(state);
    });

    it('should limit history to 100 entries', () => {
      for (let i = 0; i < 105; i++) {
        service.transition(
          'session-2',
          SessionStatus.CREATED,
          SessionStatus.INITIALIZING,
        );
      }

      const history = service.getHistory('session-2');
      expect(history).toHaveLength(100);
    });

    it('should emit session.lifecycle.state_changed event', () => {
      const state = service.transition(
        'session-3',
        SessionStatus.CREATED,
        SessionStatus.INITIALIZING,
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'session.lifecycle.state_changed',
        state,
      );
    });

    it('should include all properties in returned state', () => {
      const state = service.transition(
        'session-4',
        SessionStatus.QR_READY,
        SessionStatus.AUTHENTICATED,
        'pairing success',
      );

      expect(state.sessionId).toBe('session-4');
      expect(state.status).toBe(SessionStatus.AUTHENTICATED);
      expect(state.previousStatus).toBe(SessionStatus.QR_READY);
      expect(state.transitionReason).toBe('pairing success');
      expect(state.timestamp).toBeInstanceOf(Date);
    });

    it('should maintain separate histories for different sessions', () => {
      service.transition(
        'session-a',
        SessionStatus.CREATED,
        SessionStatus.INITIALIZING,
      );
      service.transition(
        'session-b',
        SessionStatus.CREATED,
        SessionStatus.INITIALIZING,
      );
      service.transition(
        'session-a',
        SessionStatus.INITIALIZING,
        SessionStatus.QR_READY,
      );

      expect(service.getHistory('session-a')).toHaveLength(2);
      expect(service.getHistory('session-b')).toHaveLength(1);
    });
  });

  describe('getStatusFromConnectionState', () => {
    it('should return CONNECTED for open state', () => {
      expect(service.getStatusFromConnectionState('open')).toBe(
        SessionStatus.CONNECTED,
      );
    });

    it('should return INITIALIZING for connecting state', () => {
      expect(service.getStatusFromConnectionState('connecting')).toBe(
        SessionStatus.INITIALIZING,
      );
    });

    it('should return DISCONNECTED for close with loggedOut status code', () => {
      const result = service.getStatusFromConnectionState('close', {
        error: { output: { statusCode: DisconnectReason.loggedOut } },
      });
      expect(result).toBe(SessionStatus.DISCONNECTED);
    });

    it('should return RECONNECTING for close without loggedOut', () => {
      const result = service.getStatusFromConnectionState('close', {
        error: { output: { statusCode: 500 } },
      });
      expect(result).toBe(SessionStatus.RECONNECTING);
    });

    it('should return RECONNECTING for close without error', () => {
      expect(service.getStatusFromConnectionState('close')).toBe(
        SessionStatus.RECONNECTING,
      );
    });

    it('should return INITIALIZING for undefined connection state', () => {
      expect(service.getStatusFromConnectionState(undefined)).toBe(
        SessionStatus.INITIALIZING,
      );
    });
  });

  describe('getHistory', () => {
    it('should return empty array for unknown session', () => {
      expect(service.getHistory('unknown-session')).toEqual([]);
    });

    it('should return recorded history for known session', () => {
      service.transition(
        'session-x',
        SessionStatus.CREATED,
        SessionStatus.INITIALIZING,
      );
      service.transition(
        'session-x',
        SessionStatus.INITIALIZING,
        SessionStatus.QR_READY,
      );

      const history = service.getHistory('session-x');
      expect(history).toHaveLength(2);
      expect(history[0].status).toBe(SessionStatus.INITIALIZING);
      expect(history[1].status).toBe(SessionStatus.QR_READY);
    });
  });

  describe('isTerminalState', () => {
    it('should return true for DESTROYED', () => {
      expect(service.isTerminalState(SessionStatus.DESTROYED)).toBe(true);
    });

    it('should return false for non-destroyed states', () => {
      const nonTerminalStates = [
        SessionStatus.CREATED,
        SessionStatus.INITIALIZING,
        SessionStatus.QR_READY,
        SessionStatus.PAIRING_READY,
        SessionStatus.AUTHENTICATED,
        SessionStatus.CONNECTED,
        SessionStatus.RECONNECTING,
        SessionStatus.DISCONNECTED,
        SessionStatus.QR_EXPIRED,
        SessionStatus.PAIRING_EXPIRED,
      ];
      nonTerminalStates.forEach((status) => {
        expect(service.isTerminalState(status)).toBe(false);
      });
    });
  });

  describe('isActiveState', () => {
    it('should return true for CONNECTED', () => {
      expect(service.isActiveState(SessionStatus.CONNECTED)).toBe(true);
    });

    it('should return true for AUTHENTICATED', () => {
      expect(service.isActiveState(SessionStatus.AUTHENTICATED)).toBe(true);
    });

    it('should return false for non-active states', () => {
      const nonActiveStates = [
        SessionStatus.CREATED,
        SessionStatus.INITIALIZING,
        SessionStatus.QR_READY,
        SessionStatus.PAIRING_READY,
        SessionStatus.RECONNECTING,
        SessionStatus.DISCONNECTED,
        SessionStatus.DESTROYED,
        SessionStatus.QR_EXPIRED,
        SessionStatus.PAIRING_EXPIRED,
      ];
      nonActiveStates.forEach((status) => {
        expect(service.isActiveState(status)).toBe(false);
      });
    });
  });

  describe('canRestart', () => {
    it('should return true for DISCONNECTED', () => {
      expect(service.canRestart(SessionStatus.DISCONNECTED)).toBe(true);
    });

    it('should return true for QR_EXPIRED', () => {
      expect(service.canRestart(SessionStatus.QR_EXPIRED)).toBe(true);
    });

    it('should return true for PAIRING_EXPIRED', () => {
      expect(service.canRestart(SessionStatus.PAIRING_EXPIRED)).toBe(true);
    });

    it('should return false for non-restartable states', () => {
      const nonRestartableStates = [
        SessionStatus.CREATED,
        SessionStatus.INITIALIZING,
        SessionStatus.QR_READY,
        SessionStatus.PAIRING_READY,
        SessionStatus.AUTHENTICATED,
        SessionStatus.CONNECTED,
        SessionStatus.RECONNECTING,
        SessionStatus.DESTROYED,
      ];
      nonRestartableStates.forEach((status) => {
        expect(service.canRestart(status)).toBe(false);
      });
    });
  });
});
