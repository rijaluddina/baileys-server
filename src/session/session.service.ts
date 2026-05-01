import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
  type BaileysEventMap,
  type WAMessage,
  Browsers,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import pino from 'pino';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';
import { usePrismaAuthState } from './prisma-auth-state.js';

interface SessionData {
  socket: WASocket;
  status: 'connecting' | 'open' | 'close';
  qr?: string;
  pairingCode?: string;
  webhookUrl?: string;
  user?: Record<string, unknown>;
  retryCount: number;
  saveCreds: () => Promise<void>;
}

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, SessionData>();

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) { }

  async onModuleInit() {
    // Schedule the daily message cleanup
    await this.queueService.scheduleMessageCleanup();

    // Auto-reconnect sessions that were open before shutdown
    await this.autoReconnectSessions();
  }

  async onModuleDestroy() {
    for (const [id, session] of this.sessions) {
      try {
        session.socket.end(undefined);
      } catch {
        // Socket may already be closed
      }
      // Update DB status to 'close' for graceful shutdown
      await this.prisma.session.update({
        where: { id },
        data: { status: 'close' },
      }).catch(() => { });
    }
    this.sessions.clear();
  }

  /**
   * Auto-reconnect sessions that were connected before server restart.
   */
  private async autoReconnectSessions() {
    const sessionsToReconnect = await this.prisma.session.findMany({
      where: { status: 'open' },
    });

    if (sessionsToReconnect.length === 0) {
      this.logger.log('No sessions to auto-reconnect');
      return;
    }

    this.logger.log(`Auto-reconnecting ${sessionsToReconnect.length} session(s)...`);

    for (const dbSession of sessionsToReconnect) {
      try {
        await this.createSession(dbSession.id, {
          webhookUrl: dbSession.webhookUrl ?? undefined,
        });
        this.logger.log(`Auto-reconnected session "${dbSession.id}"`);
      } catch (err) {
        this.logger.error(`Failed to auto-reconnect session "${dbSession.id}": ${err}`);
        await this.prisma.session.update({
          where: { id: dbSession.id },
          data: { status: 'close' },
        }).catch(() => { });
      }
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

    // Preserve related data (messages, contacts, chats) when reconnecting an existing session.
    await this.prisma.session.upsert({
      where: { id: sessionId },
      create: {
        id: sessionId,
        status: 'connecting',
        webhookUrl: options.webhookUrl || this.configService.get<string>('WEBHOOK_URL') || null,
      },
      update: {
        status: 'connecting',
        webhookUrl: options.webhookUrl || this.configService.get<string>('WEBHOOK_URL') || null,
      },
    });

    // Use Prisma-backed auth state instead of filesystem
    const { state, saveCreds } = await usePrismaAuthState(sessionId, this.prisma);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
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
      saveCreds,
    };

    this.sessions.set(sessionId, sessionData);

    // Handle pairing code auth
    if (options.pairingCode && options.phoneNumber) {
      try {
        const code = await socket.requestPairingCode(options.phoneNumber);
        sessionData.pairingCode = code;
        this.eventEmitter.emit('session.pairing-code', { sessionId, pairingCode: code });
        this.logger.log(`Pairing code generated for "${sessionId}": ${code}`);
      } catch (err) {
        this.logger.error(`Failed to request pairing code for ${sessionId}: ${err}`);
        // If pairing code request fails, it's often due to socket closing or rate limit
        throw new BadRequestException(`Failed to request pairing code: ${err.message}`);
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

        // Persist to DB
        await this.prisma.session.update({
          where: { id: sessionId },
          data: {
            status: 'open',
            userJid: socket.user?.id ?? null,
            userName: (socket.user as any)?.name ?? null,
            retryCount: 0,
          },
        }).catch((err) => this.logger.error(`DB update failed for ${sessionId}: ${err}`));

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

          await this.prisma.session.update({
            where: { id: sessionId },
            data: {
              status: 'close',
              retryCount: sessionData.retryCount,
            },
          }).catch(() => { });

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

          // Clean up DB — cascade delete auth credentials
          await this.prisma.session.delete({
            where: { id: sessionId },
          }).catch(() => { });

          this.eventEmitter.emit('session.logged-out', { sessionId });
          this.emitWebhook(sessionId, 'connection', { status: 'logged-out' });
        }
      }
    });

    // Save credentials on update (to DB via Prisma)
    socket.ev.on('creds.update', saveCreds);

    // Store incoming messages via BullMQ queue
    socket.ev.on('messages.upsert', (m: BaileysEventMap['messages.upsert']) => {
      if (m.messages.length > 0) {
        this.queueService.addMessageStoreJob(sessionId, m.messages as any).catch((err) => {
          this.logger.error(`Failed to queue messages for ${sessionId}: ${err}`);
        });
      }
    });

    // Sync contacts via BullMQ queue
    socket.ev.on('contacts.upsert', (contacts) => {
      this.queueService.addContactSyncJob(sessionId, contacts as any).catch((err) => {
        this.logger.error(`Failed to queue contacts for ${sessionId}: ${err}`);
      });
    });

    socket.ev.on('contacts.update', (contacts) => {
      this.queueService.addContactSyncJob(sessionId, contacts as any).catch((err) => {
        this.logger.error(`Failed to queue contacts update for ${sessionId}: ${err}`);
      });
    });

    // Sync chats via BullMQ queue
    socket.ev.on('chats.upsert', (chats) => {
      this.queueService.addChatSyncJob(sessionId, chats as any).catch((err) => {
        this.logger.error(`Failed to queue chats for ${sessionId}: ${err}`);
      });
    });

    socket.ev.on('chats.update', (chats) => {
      this.queueService.addChatSyncJob(sessionId, chats as any).catch((err) => {
        this.logger.error(`Failed to queue chats update for ${sessionId}: ${err}`);
      });
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
    if (!session) {
      // Check if session exists in DB
      const dbSession = await this.prisma.session.findUnique({ where: { id: sessionId } });
      if (!dbSession) throw new NotFoundException(`Session "${sessionId}" not found`);
    }

    if (session) {
      try {
        session.socket.end(undefined);
      } catch {
        // Socket may already be closed
      }
      this.sessions.delete(sessionId);
    }

    // Delete from DB (cascades to auth_credentials, messages, contacts, chats, webhook_logs)
    await this.prisma.session.delete({
      where: { id: sessionId },
    }).catch(() => { });

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

    // Delete from DB
    await this.prisma.session.delete({
      where: { id: sessionId },
    }).catch(() => { });

    return { sessionId, status: 'logged-out' };
  }

  async getStatus(sessionId: string): Promise<Record<string, unknown>> {
    // First check in-memory
    const session = this.sessions.get(sessionId);
    if (session) {
      return {
        sessionId,
        status: session.status,
        user: session.user,
        qr: session.qr,
        pairingCode: session.pairingCode,
      };
    }

    // Fall back to DB
    const dbSession = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!dbSession) throw new NotFoundException(`Session "${sessionId}" not found`);

    return {
      sessionId: dbSession.id,
      status: dbSession.status,
      user: dbSession.userJid ? { id: dbSession.userJid, name: dbSession.userName } : null,
    };
  }

  async getAllSessions() {
    // Get all sessions from DB (includes offline sessions)
    const dbSessions = await this.prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return dbSessions.map((s) => ({
      sessionId: s.id,
      status: this.sessions.has(s.id)
        ? this.sessions.get(s.id)!.status
        : s.status,
      user: s.userJid ? { id: s.userJid, name: s.userName } : null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * Get messages from DB with pagination.
   */
  async getMessages(sessionId: string, jid: string, limit = 25, cursor?: string) {
    const dbSession = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!dbSession) throw new NotFoundException(`Session "${sessionId}" not found`);

    const where: any = { sessionId, remoteJid: jid };
    if (cursor) {
      where.id = { lt: cursor };
    }

    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return {
      messages,
      nextCursor: messages.length === limit ? messages[messages.length - 1].id : null,
    };
  }

  /**
   * Get paginated contacts from DB.
   */
  async getContacts(sessionId: string, search?: string, limit = 50, offset = 0) {
    const dbSession = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!dbSession) throw new NotFoundException(`Session "${sessionId}" not found`);

    const where: any = { sessionId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { notify: { contains: search, mode: 'insensitive' } },
        { jid: { contains: search } },
      ];
    }

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { contacts, total, limit, offset };
  }

  /**
   * Get paginated chats from DB.
   */
  async getChats(sessionId: string, limit = 50, offset = 0) {
    const dbSession = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!dbSession) throw new NotFoundException(`Session "${sessionId}" not found`);

    const [chats, total] = await Promise.all([
      this.prisma.chat.findMany({
        where: { sessionId },
        orderBy: { conversationTimestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.chat.count({ where: { sessionId } }),
    ]);

    // Serialize BigInt
    const serializedChats = chats.map((c) => ({
      ...c,
      conversationTimestamp: c.conversationTimestamp ? Number(c.conversationTimestamp) : null,
    }));

    return { chats: serializedChats, total, limit, offset };
  }

  /**
   * Get webhook delivery logs from DB.
   */
  async getWebhookLogs(sessionId: string, limit = 50, offset = 0) {
    const dbSession = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!dbSession) throw new NotFoundException(`Session "${sessionId}" not found`);

    const [logs, total] = await Promise.all([
      this.prisma.webhookLog.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.webhookLog.count({ where: { sessionId } }),
    ]);

    return { logs, total, limit, offset };
  }

  async findMessage(sessionId: string, jid: string, messageId: string): Promise<WAMessage | undefined> {
    const storedMessage = await this.prisma.message.findFirst({
      where: { sessionId, remoteJid: jid, messageId },
    });

    return storedMessage?.content as unknown as WAMessage | undefined;
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
      // Use BullMQ queue for async delivery with retry
      this.queueService.addWebhookDeliveryJob(sessionId, webhookUrl, event, data).catch((err) => {
        this.logger.error(`Failed to queue webhook for ${sessionId}: ${err}`);
      });
    }
  }
}
