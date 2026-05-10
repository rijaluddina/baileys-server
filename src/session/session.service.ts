import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
  type BaileysEventMap,
  Browsers,
} from 'baileys';
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
  seenMessages: Set<string>;
}

const SEEN_MESSAGES_MAX = 10_000;
const SEEN_MESSAGES_PRUNE_TO = 5_000;

function addSeenMessage(set: Set<string>, id: string): void {
  if (set.size >= SEEN_MESSAGES_MAX) {
    const toDelete = [...set].slice(0, set.size - SEEN_MESSAGES_PRUNE_TO);
    for (const key of toDelete) set.delete(key);
  }
  set.add(id);
}

function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException(`Invalid webhook URL: ${url}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException('Webhook URL must use http or https');
  }
  // Block SSRF — private/loopback/cloud-metadata ranges
  const hostname = parsed.hostname;
  const blocked = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^169\.254\./, // link-local / cloud metadata
    /^::1$/,
    /^0\.0\.0\.0$/,
  ];
  if (blocked.some((re) => re.test(hostname))) {
    throw new BadRequestException(
      'Webhook URL must not target private or loopback addresses',
    );
  }
}

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, SessionData>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async onModuleInit() {
    // Schedule the daily message cleanup
    await this.queueService.scheduleMessageCleanup();

    // Auto-reconnect sessions that were open before shutdown
    await this.autoReconnectSessions();
  }

  async onModuleDestroy() {
    this.clearAllReconnectTimers();

    for (const [id, session] of this.sessions) {
      try {
        await session.socket.end(undefined);
      } catch {
        // Socket may already be closed
      }
      // Update DB status to 'close' for graceful shutdown
      await this.prisma.session
        .update({
          where: { id },
          data: { status: 'close' },
        })
        .catch(() => {});
    }
    this.sessions.clear();
  }

  /**
   * Auto-reconnect sessions that were connected before server restart.
   */
  private async autoReconnectSessions() {
    // Reconnect all sessions in database (open, close, connecting)
    const sessionsToReconnect = await this.prisma.session.findMany();

    if (sessionsToReconnect.length === 0) {
      this.logger.log('No sessions to auto-reconnect');
      return;
    }

    const total = sessionsToReconnect.length;
    this.logger.log(`Auto-reconnecting ${total} session(s)...`);

    for (let i = 0; i < total; i++) {
      const dbSession = sessionsToReconnect[i];
      try {
        if (i > 0) {
          const delay = 500 + Math.floor(Math.random() * 500); // 500-1000ms stagger
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        this.logger.log(
          `Reconnecting session ${i + 1}/${total}: "${dbSession.id}"...`,
        );
        await this.createSession(dbSession.id, {
          webhookUrl: dbSession.webhookUrl ?? undefined,
        });
        this.logger.log(`Auto-reconnected session "${dbSession.id}"`);
      } catch (err) {
        this.logger.error(
          `Failed to auto-reconnect session "${dbSession.id}": ${err}`,
        );
        await this.prisma.session
          .update({
            where: { id: dbSession.id },
            data: { status: 'close' },
          })
          .catch(() => {});
      }
    }
  }

  getSocket(sessionId: string): WASocket {
    const session = this.sessions.get(sessionId);
    if (!session)
      throw new NotFoundException(`Session "${sessionId}" not found`);
    if (session.status !== 'open')
      throw new BadRequestException(`Session "${sessionId}" is not connected`);
    return session.socket;
  }

  getSessionData(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session)
      throw new NotFoundException(`Session "${sessionId}" not found`);
    return session;
  }

  isSessionExists(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async createSession(
    sessionId: string,
    options: {
      webhookUrl?: string;
      pairingCode?: boolean;
      phoneNumber?: string;
    } = {},
  ) {
    this.clearReconnectTimer(sessionId);

    if (this.sessions.has(sessionId)) {
      throw new ConflictException(`Session "${sessionId}" already exists`);
    }

    // Validate webhook URL to prevent SSRF
    if (options.webhookUrl) validateWebhookUrl(options.webhookUrl);
    const globalWebhookUrl = this.configService.get<string>('WEBHOOK_URL');
    if (globalWebhookUrl) validateWebhookUrl(globalWebhookUrl);

    // Preserve related data (messages, contacts, chats) when reconnecting an existing session.
    await this.prisma.session.upsert({
      where: { id: sessionId },
      create: {
        id: sessionId,
        status: 'connecting',
        webhookUrl:
          options.webhookUrl ||
          this.configService.get<string>('WEBHOOK_URL') ||
          null,
      },
      update: {
        status: 'connecting',
        webhookUrl:
          options.webhookUrl ||
          this.configService.get<string>('WEBHOOK_URL') ||
          null,
      },
    });

    // Use Prisma-backed auth state instead of filesystem
    const { state, saveCreds } = await usePrismaAuthState(
      sessionId,
      this.prisma,
      this.cache,
      this.logger,
    );
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Baileys Server'),
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
    });

    const sessionData: SessionData = {
      socket,
      status: 'connecting',
      webhookUrl:
        options.webhookUrl || this.configService.get<string>('WEBHOOK_URL'),
      retryCount: 0,
      saveCreds,
      seenMessages: new Set<string>(),
    };

    this.sessions.set(sessionId, sessionData);

    // Handle pairing code auth
    if (options.pairingCode && options.phoneNumber) {
      try {
        const code = await socket.requestPairingCode(options.phoneNumber);
        sessionData.pairingCode = code;
        this.eventEmitter.emit('session.pairing-code', {
          sessionId,
          pairingCode: code,
        });
        this.logger.log(`Pairing code generated for "${sessionId}": ${code}`);
      } catch (err) {
        this.logger.error(
          `Failed to request pairing code for ${sessionId}: ${err}`,
        );
        // If pairing code request fails, it's often due to socket closing or rate limit
        throw new BadRequestException(
          `Failed to request pairing code: ${(err as Error).message}`,
        );
      }
    }

    // Baileys throws "Connection Closed" during normal reconnect lifecycle; suppress it.
    const isBaileysLifecycleError = (err: unknown) =>
      err instanceof Error &&
      /Connection (Closed|Terminated|Lost)|Timed Out/i.test(err.message);

    // Connection update handler
    socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      void (async () => {
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
          this.logger.log(
            `Session "${sessionId}" connected as ${socket.user?.id}`,
          );

          // Persist to DB
          await this.prisma.session
            .update({
              where: { id: sessionId },
              data: {
                status: 'open',
                userJid: socket.user?.id ?? null,
                userName: (socket.user as { name?: string })?.name ?? null,
                retryCount: 0,
              },
            })
            .catch((err: unknown) =>
              this.logger.error(
                `DB update failed for ${sessionId}: ${String(err)}`,
              ),
            );

          this.eventEmitter.emit('session.connected', {
            sessionId,
            user: socket.user,
          });
          this.emitWebhook(sessionId, 'connection', {
            status: 'open',
            user: socket.user,
          });
        }

        if (connection === 'close') {
          sessionData.status = 'close';
          sessionData.seenMessages.clear();
          const disconnectError = lastDisconnect?.error as
            | { output?: { statusCode?: number } }
            | undefined;
          const statusCode = disconnectError?.output?.statusCode;
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

            await this.prisma.session
              .update({
                where: { id: sessionId },
                data: {
                  status: 'close',
                  retryCount: sessionData.retryCount,
                },
              })
              .catch(() => {});

            const delay = Math.min(
              1000 * Math.pow(2, sessionData.retryCount),
              30000,
            );
            this.logger.log(
              `Reconnecting "${sessionId}" in ${delay}ms (attempt ${sessionData.retryCount})`,
            );

            this.clearReconnectTimer(sessionId);
            const timer = setTimeout(() => {
              this.reconnectTimers.delete(sessionId);
              if (!this.sessions.has(sessionId)) return;
              this.sessions.delete(sessionId);
              this.createSession(sessionId, options).catch((err: unknown) => {
                this.logger.error(
                  `Failed to reconnect "${sessionId}": ${String(err)}`,
                );
              });
            }, delay);
            this.reconnectTimers.set(sessionId, timer);
          } else if (!shouldReconnect) {
            this.logger.log(`Session "${sessionId}" logged out, cleaning up`);
            this.clearReconnectTimer(sessionId);
            this.sessions.delete(sessionId);

            // Clean up DB — cascade delete auth credentials
            await this.prisma.session
              .delete({
                where: { id: sessionId },
              })
              .catch(() => {});

            this.eventEmitter.emit('session.logged-out', { sessionId });
            this.emitWebhook(sessionId, 'connection', { status: 'logged-out' });
          }
        }
      })().catch((err: unknown) => {
        if (!isBaileysLifecycleError(err)) {
          this.logger.error(
            `connection.update error for "${sessionId}": ${String(err)}`,
          );
        }
      });
    });

    // Save credentials on update (to DB via Prisma)
    socket.ev.on('creds.update', () => {
      void saveCreds().catch((err: unknown) => {
        this.logger.error(
          `Critical: Failed to save credentials for ${sessionId}: ${String(err)}`,
        );
      });
    });

    // Store incoming messages via BullMQ queue
    socket.ev.on('messages.upsert', (m: BaileysEventMap['messages.upsert']) => {
      const newMessages = m.messages.filter((msg) => {
        if (!msg.key?.id) return false;
        if (sessionData.seenMessages.has(msg.key.id)) return false;
        addSeenMessage(sessionData.seenMessages, msg.key.id);
        return true;
      });

      if (newMessages.length > 0) {
        void this.queueService
          .addMessageStoreJob(sessionId, newMessages as unknown[])
          .catch((err: unknown) => {
            this.logger.error(
              `Failed to queue messages for ${sessionId}: ${String(err)}`,
            );
          });
      }
    });

    // Handle history sync
    socket.ev.on('messaging-history.set', (data) => {
      if (data.messages) {
        for (const msg of data.messages) {
          if (msg.key?.id) {
            addSeenMessage(sessionData.seenMessages, msg.key.id);
          }
        }
      }

      void this.queueService
        .addHistorySyncJob(sessionId, data)
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to queue history sync for ${sessionId}: ${String(err)}`,
          );
        });
    });

    // Sync contacts via BullMQ queue
    socket.ev.on('contacts.upsert', (contacts) => {
      void this.queueService
        .addContactSyncJob(sessionId, contacts as unknown[])
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to queue contacts for ${sessionId}: ${String(err)}`,
          );
        });
    });

    socket.ev.on('contacts.update', (contacts) => {
      void this.queueService
        .addContactSyncJob(sessionId, contacts as unknown[])
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to queue contacts update for ${sessionId}: ${String(err)}`,
          );
        });
    });

    // Sync chats via BullMQ queue
    socket.ev.on('chats.upsert', (chats) => {
      void this.queueService
        .addChatSyncJob(sessionId, chats as unknown[])
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to queue chats for ${sessionId}: ${String(err)}`,
          );
        });
    });

    socket.ev.on('chats.update', (chats) => {
      void this.queueService
        .addChatSyncJob(sessionId, chats as unknown[])
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to queue chats update for ${sessionId}: ${String(err)}`,
          );
        });
    });

    socket.ev.on('chats.delete', (jids: string[]) => {
      void this.prisma.chat
        .deleteMany({ where: { sessionId, jid: { in: jids } } })
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to delete chats for ${sessionId}: ${String(err)}`,
          );
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
    this.clearReconnectTimer(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Check if session exists in DB
      const dbSession = await this.prisma.session.findUnique({
        where: { id: sessionId },
      });
      if (!dbSession)
        throw new NotFoundException(`Session "${sessionId}" not found`);
    }

    if (session) {
      try {
        await session.socket.end(undefined);
      } catch {
        // Socket may already be closed
      }
      this.sessions.delete(sessionId);
    }

    // Delete from DB (cascades to auth_credentials, messages, contacts, chats, webhook_logs)
    await this.prisma.session
      .delete({
        where: { id: sessionId },
      })
      .catch(() => {});

    this.logger.log(`Session "${sessionId}" deleted`);
    return { sessionId, status: 'deleted' };
  }

  async logoutSession(sessionId: string) {
    this.clearReconnectTimer(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session)
      throw new NotFoundException(`Session "${sessionId}" not found`);

    try {
      await session.socket.logout();
    } catch {
      // Ignore
    }

    this.sessions.delete(sessionId);

    // Delete from DB
    await this.prisma.session
      .delete({
        where: { id: sessionId },
      })
      .catch(() => {});

    return { sessionId, status: 'logged-out' };
  }

  async reconnectSession(sessionId: string) {
    await this.removeFromMemory(sessionId);
    return this.createSession(sessionId);
  }

  async removeFromMemory(sessionId: string) {
    this.clearReconnectTimer(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        await session.socket.end(undefined);
      } catch {
        // Socket may already be closed
      }
      this.sessions.delete(sessionId);
    }
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
    const dbSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!dbSession)
      throw new NotFoundException(`Session "${sessionId}" not found`);

    return {
      sessionId: dbSession.id,
      status: dbSession.status === 'open' ? 'close' : dbSession.status,
      user: dbSession.userJid
        ? { id: dbSession.userJid, name: dbSession.userName }
        : null,
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
        : s.status === 'open'
          ? 'close'
          : s.status,
      user: s.userJid ? { id: s.userJid, name: s.userName } : null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
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
      this.queueService
        .addWebhookDeliveryJob(sessionId, webhookUrl, event, data)
        .catch((err) => {
          this.logger.error(`Failed to queue webhook for ${sessionId}: ${err}`);
        });
    }
  }

  private clearReconnectTimer(sessionId: string) {
    const timer = this.reconnectTimers.get(sessionId);
    if (!timer) return;
    clearTimeout(timer);
    this.reconnectTimers.delete(sessionId);
  }

  private clearAllReconnectTimers() {
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
  }
}
