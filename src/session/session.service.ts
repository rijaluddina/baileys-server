import {
  Injectable,
  Logger,
  OnModuleDestroy,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
  type BaileysEventMap,
  type WAMessage,
  Browsers,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';

interface SessionData {
  socket: WASocket;
  status: 'connecting' | 'open' | 'close';
  qr?: string;
  pairingCode?: string;
  webhookUrl?: string;
  user?: Record<string, unknown>;
  retryCount: number;
  messages: Map<string, WAMessage[]>;
}

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, SessionData>();
  private readonly sessionDir: string;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.sessionDir = this.configService.get<string>('SESSION_DATA_DIR') || './sessions';
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  async onModuleDestroy() {
    for (const [id] of this.sessions) {
      await this.deleteSession(id);
    }
  }

  getSocket(sessionId: string): WASocket {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException(`Session "${sessionId}" not found`);
    if (session.status !== 'open') throw new BadRequestException(`Session "${sessionId}" is not connected`);
    return session.socket;
  }

  getSessionData(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException(`Session "${sessionId}" not found`);
    return session;
  }

  isSessionExists(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async createSession(
    sessionId: string,
    options: { webhookUrl?: string; pairingCode?: boolean; phoneNumber?: string } = {},
  ) {
    if (this.sessions.has(sessionId)) {
      throw new ConflictException(`Session "${sessionId}" already exists`);
    }

    const authDir = path.join(this.sessionDir, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }) as any,
      browser: Browsers.ubuntu('Baileys Server'),
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
    });

    const sessionData: SessionData = {
      socket,
      status: 'connecting',
      webhookUrl: options.webhookUrl || this.configService.get<string>('WEBHOOK_URL'),
      retryCount: 0,
      messages: new Map(),
    };

    this.sessions.set(sessionId, sessionData);

    // Handle pairing code auth
    if (options.pairingCode && options.phoneNumber) {
      try {
        const code = await socket.requestPairingCode(options.phoneNumber);
        sessionData.pairingCode = code;
        this.eventEmitter.emit('session.pairing-code', { sessionId, pairingCode: code });
      } catch (err) {
        this.logger.error(`Failed to request pairing code for ${sessionId}: ${err}`);
      }
    }

    // Connection update handler
    socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !options.pairingCode) {
        const qrBase64 = await QRCode.toDataURL(qr);
        sessionData.qr = qrBase64;
        sessionData.status = 'connecting';
        this.eventEmitter.emit('session.qr', { sessionId, qr: qrBase64 });
        this.emitWebhook(sessionId, 'qr', { qr: qrBase64 });
      }

      if (connection === 'open') {
        sessionData.status = 'open';
        sessionData.qr = undefined;
        sessionData.retryCount = 0;
        sessionData.user = socket.user ? { ...socket.user } : undefined;
        this.logger.log(`Session "${sessionId}" connected as ${socket.user?.id}`);
        this.eventEmitter.emit('session.connected', { sessionId, user: socket.user });
        this.emitWebhook(sessionId, 'connection', { status: 'open', user: socket.user });
      }

      if (connection === 'close') {
        sessionData.status = 'close';
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        this.logger.warn(
          `Session "${sessionId}" disconnected (code: ${statusCode}), reconnect: ${shouldReconnect}`,
        );

        this.emitWebhook(sessionId, 'connection', {
          status: 'close',
          reason: statusCode,
          shouldReconnect,
        });

        if (shouldReconnect && sessionData.retryCount < 5) {
          sessionData.retryCount++;
          const delay = Math.min(1000 * Math.pow(2, sessionData.retryCount), 30000);
          this.logger.log(`Reconnecting "${sessionId}" in ${delay}ms (attempt ${sessionData.retryCount})`);
          setTimeout(() => {
            this.sessions.delete(sessionId);
            this.createSession(sessionId, options).catch((err) => {
              this.logger.error(`Failed to reconnect "${sessionId}": ${err}`);
            });
          }, delay);
        } else if (!shouldReconnect) {
          this.logger.log(`Session "${sessionId}" logged out, cleaning up`);
          this.sessions.delete(sessionId);
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }
          this.eventEmitter.emit('session.logged-out', { sessionId });
          this.emitWebhook(sessionId, 'connection', { status: 'logged-out' });
        }
      }
    });

    // Save credentials on update
    socket.ev.on('creds.update', saveCreds);

    // Store incoming messages in memory
    socket.ev.on('messages.upsert', (m: BaileysEventMap['messages.upsert']) => {
      for (const msg of m.messages) {
        const jid = msg.key.remoteJid;
        if (!jid) continue;
        if (!sessionData.messages.has(jid)) {
          sessionData.messages.set(jid, []);
        }
        const arr = sessionData.messages.get(jid)!;
        arr.push(msg);
        // Keep max 500 messages per chat
        if (arr.length > 500) arr.splice(0, arr.length - 500);
      }
    });

    // Forward all Baileys events to webhook
    this.bindBaileysEvents(sessionId, socket);

    return {
      sessionId,
      status: sessionData.status,
      qr: sessionData.qr,
      pairingCode: sessionData.pairingCode,
    };
  }

  async deleteSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException(`Session "${sessionId}" not found`);

    try {
      session.socket.end(undefined);
    } catch {
      // Socket may already be closed
    }

    this.sessions.delete(sessionId);

    const authDir = path.join(this.sessionDir, sessionId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    this.logger.log(`Session "${sessionId}" deleted`);
    return { sessionId, status: 'deleted' };
  }

  async logoutSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException(`Session "${sessionId}" not found`);

    try {
      await session.socket.logout();
    } catch {
      // Ignore
    }

    this.sessions.delete(sessionId);

    const authDir = path.join(this.sessionDir, sessionId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    return { sessionId, status: 'logged-out' };
  }

  getStatus(sessionId: string): Record<string, unknown> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException(`Session "${sessionId}" not found`);
    return {
      sessionId,
      status: session.status,
      user: session.user,
      qr: session.qr,
      pairingCode: session.pairingCode,
    };
  }

  getAllSessions() {
    const result: Record<string, unknown>[] = [];
    for (const [id, session] of this.sessions) {
      result.push({
        sessionId: id,
        status: session.status,
        user: session.user,
      });
    }
    return result;
  }

  getMessages(sessionId: string, jid: string, limit = 25): WAMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException(`Session "${sessionId}" not found`);
    const msgs = session.messages.get(jid) || [];
    return msgs.slice(-limit);
  }

  findMessage(sessionId: string, jid: string, messageId: string): WAMessage | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const msgs = session.messages.get(jid) || [];
    return msgs.find((m) => m.key.id === messageId);
  }

  private bindBaileysEvents(sessionId: string, socket: WASocket) {
    const eventsToForward: (keyof BaileysEventMap)[] = [
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
    ];

    for (const event of eventsToForward) {
      socket.ev.on(event, (data: unknown) => {
        this.eventEmitter.emit(`baileys.${event}`, { sessionId, data });
        this.emitWebhook(sessionId, event, data);
      });
    }
  }

  private emitWebhook(sessionId: string, event: string, data: unknown) {
    const session = this.sessions.get(sessionId);
    const webhookUrl = session?.webhookUrl;
    if (webhookUrl) {
      this.eventEmitter.emit('webhook.deliver', {
        sessionId,
        webhookUrl,
        event,
        data,
      });
    }
  }
}
