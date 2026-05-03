import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Prisma } from '../../generated/prisma/client/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_NAMES } from '../queue.constants.js';

interface HistorySyncJob {
  sessionId: string;
  data: {
    chats?: Array<{
      id: string;
      name?: string;
      conversationTimestamp?: number | Long | string;
      unreadCount?: number;
      archived?: boolean;
      pinned?: boolean;
      muteEndTime?: number | Long | string;
    }>;
    contacts?: Array<{
      id: string;
      name?: string;
      notify?: string;
      imgUrl?: string;
      status?: string;
    }>;
    messages?: Array<{
      key: {
        remoteJid?: string;
        id?: string;
        fromMe?: boolean;
        participant?: string;
      };
      pushName?: string;
      messageTimestamp?: number | Long;
      message?: Record<string, unknown>;
    }>;
    isLatest?: boolean;
  };
}

// Handle Long type from protobuf
interface Long {
  low: number;
  high: number;
  unsigned: boolean;
}

function toLong(val: number | Long | string | undefined): number {
  if (!val) return Date.now() / 1000;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseInt(val, 10);
  return val.low;
}

function getMessageType(
  message: Record<string, unknown> | undefined,
): string | null {
  if (!message) return null;
  const types = [
    'conversation',
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'stickerMessage',
    'contactMessage',
    'locationMessage',
    'extendedTextMessage',
    'pollCreationMessage',
    'reactionMessage',
    'listMessage',
    'buttonsMessage',
  ];
  return types.find((t) => t in message) ?? null;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Processor(QUEUE_NAMES.HISTORY_SYNC)
export class HistorySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(HistorySyncProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<HistorySyncJob>): Promise<void> {
    const { sessionId, data } = job.data;
    const { chats = [], contacts = [], messages = [] } = data;

    let chatOps = 0;
    let contactOps = 0;
    let messageOps = 0;

    // Process Contacts
    if (contacts.length > 0) {
      const contactOperations = contacts.flatMap((contact) => {
        if (!contact.id) return [];
        return this.prisma.contact.upsert({
          where: {
            sessionId_jid: {
              sessionId,
              jid: contact.id,
            },
          },
          create: {
            sessionId,
            jid: contact.id,
            name: contact.name ?? null,
            notify: contact.notify ?? null,
            imgUrl: contact.imgUrl ?? null,
            status: contact.status ?? null,
          },
          update: {
            name: contact.name ?? undefined,
            notify: contact.notify ?? undefined,
            imgUrl: contact.imgUrl ?? undefined,
            status: contact.status ?? undefined,
          },
        });
      });

      // Execute in chunks of 100
      for (let i = 0; i < contactOperations.length; i += 100) {
        const chunk = contactOperations.slice(i, i + 100);
        try {
          await this.prisma.$transaction(chunk);
          contactOps += chunk.length;
        } catch (err) {
          this.logger.warn(
            `Failed to store contacts batch for session ${sessionId}: ${err}`,
          );
        }
      }
    }

    // Process Chats
    if (chats.length > 0) {
      const chatOperations = chats.flatMap((chat) => {
        if (!chat.id) return [];
        const ts = chat.conversationTimestamp
          ? toLong(chat.conversationTimestamp)
          : null;

        return this.prisma.chat.upsert({
          where: {
            sessionId_jid: {
              sessionId,
              jid: chat.id,
            },
          },
          create: {
            sessionId,
            jid: chat.id,
            name: chat.name ?? null,
            conversationTimestamp: ts !== null ? BigInt(ts) : null,
            unreadCount: chat.unreadCount ?? 0,
            archived: chat.archived ?? false,
            pinned: chat.pinned ?? false,
            muted: chat.muteEndTime ? true : false,
          },
          update: {
            name: chat.name ?? undefined,
            conversationTimestamp: ts !== null ? BigInt(ts) : undefined,
            unreadCount: chat.unreadCount ?? undefined,
            archived: chat.archived ?? undefined,
            pinned: chat.pinned ?? undefined,
            muted: chat.muteEndTime ? true : undefined,
          },
        });
      });

      // Execute in chunks of 100
      for (let i = 0; i < chatOperations.length; i += 100) {
        const chunk = chatOperations.slice(i, i + 100);
        try {
          await this.prisma.$transaction(chunk);
          chatOps += chunk.length;
        } catch (err) {
          this.logger.warn(
            `Failed to store chats batch for session ${sessionId}: ${err}`,
          );
        }
      }
    }

    // Process Messages
    if (messages.length > 0) {
      const messageOperations = messages.flatMap((msg) => {
        const remoteJid = msg.key?.remoteJid;
        const messageId = msg.key?.id;
        if (!remoteJid || !messageId) return [];

        const ts = toLong(msg.messageTimestamp);
        const content = toInputJson(msg);

        return this.prisma.message.upsert({
          where: {
            sessionId_remoteJid_messageId: {
              sessionId,
              remoteJid,
              messageId,
            },
          },
          create: {
            sessionId,
            remoteJid,
            messageId,
            fromMe: msg.key.fromMe ?? false,
            participant: msg.key.participant ?? null,
            pushName: msg.pushName ?? null,
            messageType: getMessageType(msg.message),
            content,
            timestamp: new Date(ts * 1000),
          },
          update: {
            content,
          },
        });
      });

      // Execute in chunks of 100
      for (let i = 0; i < messageOperations.length; i += 100) {
        const chunk = messageOperations.slice(i, i + 100);
        try {
          await this.prisma.$transaction(chunk);
          messageOps += chunk.length;
        } catch (err) {
          this.logger.warn(
            `Failed to store messages batch for session ${sessionId}: ${err}`,
          );
        }
      }
    }

    this.logger.log(
      `History sync completed for session ${sessionId}: ${contactOps} contacts, ${chatOps} chats, ${messageOps} messages stored.`,
    );
  }
}
