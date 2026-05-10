import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DisconnectReason } from 'baileys';

export enum SessionStatus {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  QR_READY = 'qr_ready',
  PAIRING_READY = 'pairing_ready',
  AUTHENTICATED = 'authenticated',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',
  DESTROYED = 'destroyed',
  QR_EXPIRED = 'qr_expired',
  PAIRING_EXPIRED = 'pairing_expired',
}

export interface SessionLifecycleState {
  sessionId: string;
  status: SessionStatus;
  previousStatus: SessionStatus | null;
  transitionReason?: string;
  timestamp: Date;
}

export class SessionLifecycleService {
  private readonly logger = new Logger(SessionLifecycleService.name);
  private readonly stateHistory = new Map<string, SessionLifecycleState[]>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  getInitialStatus(): SessionStatus {
    return SessionStatus.CREATED;
  }

  getNextStatus(
    currentStatus: SessionStatus,
    trigger:
      | 'start'
      | 'qr'
      | 'pairing_code'
      | 'authenticated'
      | 'connected'
      | 'disconnected'
      | 'logged_out'
      | 'destroy'
      | 'timeout'
      | 'max_retries'
      | 'restart',
  ): SessionStatus {
    const transitions: Record<
      SessionStatus,
      Partial<Record<typeof trigger, SessionStatus>>
    > = {
      [SessionStatus.CREATED]: {
        start: SessionStatus.INITIALIZING,
      },
      [SessionStatus.INITIALIZING]: {
        qr: SessionStatus.QR_READY,
        pairing_code: SessionStatus.PAIRING_READY,
        disconnected: SessionStatus.DISCONNECTED,
        timeout: SessionStatus.DISCONNECTED,
      },
      [SessionStatus.QR_READY]: {
        authenticated: SessionStatus.AUTHENTICATED,
        timeout: SessionStatus.QR_EXPIRED,
        disconnected: SessionStatus.DISCONNECTED,
      },
      [SessionStatus.PAIRING_READY]: {
        authenticated: SessionStatus.AUTHENTICATED,
        timeout: SessionStatus.PAIRING_EXPIRED,
        disconnected: SessionStatus.DISCONNECTED,
      },
      [SessionStatus.QR_EXPIRED]: {
        restart: SessionStatus.INITIALIZING,
      },
      [SessionStatus.PAIRING_EXPIRED]: {
        restart: SessionStatus.INITIALIZING,
      },
      [SessionStatus.AUTHENTICATED]: {
        connected: SessionStatus.CONNECTED,
        disconnected: SessionStatus.DISCONNECTED,
      },
      [SessionStatus.CONNECTED]: {
        disconnected: SessionStatus.RECONNECTING,
        logged_out: SessionStatus.DISCONNECTED,
        destroy: SessionStatus.DESTROYED,
      },
      [SessionStatus.RECONNECTING]: {
        connected: SessionStatus.CONNECTED,
        disconnected: SessionStatus.DISCONNECTED,
        max_retries: SessionStatus.DISCONNECTED,
      },
      [SessionStatus.DISCONNECTED]: {
        restart: SessionStatus.INITIALIZING,
        destroy: SessionStatus.DESTROYED,
        logged_out: SessionStatus.DESTROYED,
      },
      [SessionStatus.DESTROYED]: {},
    };

    return transitions[currentStatus]?.[trigger] ?? currentStatus;
  }

  transition(
    sessionId: string,
    fromStatus: SessionStatus,
    toStatus: SessionStatus,
    reason?: string,
  ): SessionLifecycleState {
    const state: SessionLifecycleState = {
      sessionId,
      status: toStatus,
      previousStatus: fromStatus,
      transitionReason: reason,
      timestamp: new Date(),
    };

    const history = this.stateHistory.get(sessionId) ?? [];
    history.push(state);
    if (history.length > 100) history.shift();
    this.stateHistory.set(sessionId, history);

    this.eventEmitter.emit('session.lifecycle.state_changed', state);

    this.logger.log(
      `Session "${sessionId}" transitioned: ${fromStatus} → ${toStatus}${reason ? ` (${reason})` : ''}`,
    );

    return state;
  }

  getStatusFromConnectionState(
    connectionState: string | undefined,
    lastDisconnect?: { error?: { output?: { statusCode?: number } } },
  ): SessionStatus {
    if (connectionState === 'open') return SessionStatus.CONNECTED;
    if (connectionState === 'connecting') return SessionStatus.INITIALIZING;
    if (connectionState === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        return SessionStatus.DISCONNECTED;
      }
      return SessionStatus.RECONNECTING;
    }
    return SessionStatus.INITIALIZING;
  }

  getHistory(sessionId: string): SessionLifecycleState[] {
    return this.stateHistory.get(sessionId) ?? [];
  }

  isTerminalState(status: SessionStatus): boolean {
    return status === SessionStatus.DESTROYED;
  }

  isActiveState(status: SessionStatus): boolean {
    return (
      status === SessionStatus.CONNECTED ||
      status === SessionStatus.AUTHENTICATED
    );
  }

  canRestart(status: SessionStatus): boolean {
    return (
      status === SessionStatus.DISCONNECTED ||
      status === SessionStatus.QR_EXPIRED ||
      status === SessionStatus.PAIRING_EXPIRED
    );
  }
}
