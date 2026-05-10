import { Logger } from '@nestjs/common';
import type { WASocket, BaileysEventMap } from 'baileys';
import { makeWASocket, fetchLatestBaileysVersion, Browsers } from 'baileys';
import type { AuthenticationState } from 'baileys';
import { EventEmitter2 } from '@nestjs/event-emitter';
import pino from 'pino';

export interface BaileysAdapterOptions {
  sessionId: string;
  auth: AuthenticationState;
  webhookUrl?: string;
  browser?: [string, string, string];
  logger?: pino.Logger;
}

export class BaileysAdapterService {
  private readonly logger = new Logger(BaileysAdapterService.name);
  private socket: WASocket | null = null;
  private readonly sessionId: string;
  private readonly eventEmitter: EventEmitter2;

  constructor(sessionId: string, eventEmitter: EventEmitter2) {
    this.sessionId = sessionId;
    this.eventEmitter = eventEmitter;
  }

  async connect(options: BaileysAdapterOptions): Promise<WASocket> {
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: options.auth,
      browser: options.browser ?? Browsers.ubuntu('Baileys Server'),
      printQRInTerminal: false,
      logger: options.logger ?? pino({ level: 'silent' }),
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      getMessage: async (): Promise<undefined> => {
        return await Promise.resolve(undefined);
      },
    });

    this.bindSocketEvents(this.socket);

    return this.socket;
  }

  getSocket(): WASocket {
    if (!this.socket) {
      throw new Error(`Socket not initialized for session: ${this.sessionId}`);
    }
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.ws?.isOpen ?? false;
  }

  async end(logout = false): Promise<void> {
    if (!this.socket) return;

    try {
      if (logout) {
        await this.socket.logout();
      } else {
        void this.socket.end(undefined);
      }
    } catch (err) {
      this.logger.warn(`Error ending socket for ${this.sessionId}: ${err}`);
    }

    this.socket = null;
  }

  private bindSocketEvents(socket: WASocket): void {
    const events: (keyof BaileysEventMap)[] = [
      'connection.update',
      'creds.update',
      'messages.upsert',
      'messages.update',
      'messages.delete',
      'messages.reaction',
      'message-receipt.update',
      'presence.update',
      'chats.upsert',
      'chats.update',
      'chats.delete',
      'contacts.upsert',
      'contacts.update',
      'groups.upsert',
      'groups.update',
      'group-participants.update',
      'labels.edit',
      'labels.association',
      'call',
    ];

    for (const event of events) {
      socket.ev.on(event, (data: unknown) => {
        this.eventEmitter.emit(`baileys.${event}`, {
          sessionId: this.sessionId,
          data,
        });
      });
    }
  }
}
