import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Prisma } from '../../generated/prisma/client/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_NAMES } from '../queue.constants.js';

interface MessageJob {
  sessionId: string;
  messages: Array<{
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
}

// Handle Long type from protobuf
interface Long {
  low: number;
  high: number;
  unsigned: boolean;
}

function toLong(val: number | Long | undefined): number {
  if (!val) return Date.now() / 1000;
  if (typeof val === 'number') return val;
  return val.low;
}

function getMessageType(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const types = [
    'conversation', 'imageMessage', 'videoMessage', 'audioMessage',
    'documentMessage', 'stickerMessage', 'contactMessage',
    'locationMessage', 'extendedTextMessage', 'pollCreationMessage',
    'reactionMessage', 'listMessage', 'buttonsMessage',
  ];
  return types.find((t) => t in message) ?? null;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Processor(QUEUE_NAMES.MESSAGE_STORE)
export class MessageStoreProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageStoreProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<MessageJob>): Promise<void> {
    const { sessionId, messages } = job.data;

    const operations = messages.flatMap((msg) => {
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

    if (operations.length > 0) {
      try {
        await this.prisma.$transaction(operations);
      } catch (err) {
        this.logger.warn(`Failed to store messages for session ${sessionId}: ${err}`);
      }
    }

    this.logger.debug(`Stored ${operations.length}/${messages.length} messages for session ${sessionId}`);
  }
}
