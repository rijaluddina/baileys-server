import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Chat, Contact, WAMessage } from 'baileys';
import type { Prisma } from '../../generated/prisma/client/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_NAMES } from '../queue.constants.js';
import { QueueService } from '../queue.service.js';
import {
  toLong,
  getMessageType,
  toInputJson,
  type Long,
} from '../../common/utils/baileys-helpers.js';

interface HistorySyncJob {
  sessionId: string;
  data: {
    chats: Chat[];
    contacts: Contact[];
    messages: WAMessage[];
    isLatest?: boolean;
  };
}

type BatchOperation = Prisma.PrismaPromise<unknown>;

@Processor(QUEUE_NAMES.HISTORY_SYNC)
export class HistorySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(HistorySyncProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(forwardRef(() => QueueService))
    private readonly queueService: QueueService,
  ) {
    super();
  }

  async process(job: Job<HistorySyncJob>): Promise<void> {
    const { sessionId, data } = job.data;
    const { chats = [], contacts = [], messages = [] } = data;

    this.logger.log(
      `Processing history sync for session ${sessionId}: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`,
    );

    // 1. Sync Chats
    if (chats.length > 0) {
      const chatOps = chats.flatMap((chat) =>
        this.buildChatUpsert(sessionId, chat),
      );
      await this.runBatched(chatOps, 'chats', sessionId);
    }

    // 2. Sync Contacts
    if (contacts.length > 0) {
      const contactOps = contacts.map((contact) => ({
        sessionId,
        jid: contact.id,
        name: contact.name ?? null,
        notify: contact.notify ?? null,
        imgUrl: contact.imgUrl ?? null,
        status: contact.status ?? null,
      }));

      // Use createMany with skipDuplicates for contacts as they are often redundant
      await this.prisma.contact
        .createMany({
          data: contactOps,
          skipDuplicates: true,
        })
        .catch((err) =>
          this.logger.warn(`Failed to bulk create contacts: ${err}`),
        );
    }

    // 3. Sync Messages
    if (messages.length > 0) {
      const messageOps = messages.flatMap((message) =>
        this.buildMessageUpserts(sessionId, message),
      );
      await this.runBatched(messageOps, 'messages', sessionId);
    }

    // 4. Emit Webhook
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { webhookUrl: true },
    });

    if (session?.webhookUrl) {
      await this.queueService.addWebhookDeliveryJob(
        sessionId,
        session.webhookUrl,
        'messaging-history.set',
        {
          chatCount: chats.length,
          contactCount: contacts.length,
          messageCount: messages.length,
          isLatest: data.isLatest,
        },
      );
    }

    this.logger.debug(`History sync completed for session ${sessionId}`);
  }

  private async runBatched(
    ops: BatchOperation[],
    label: string,
    sessionId: string,
    batchSize = 100,
  ) {
    for (let i = 0; i < ops.length; i += batchSize) {
      const batch = ops.slice(i, i + batchSize);
      try {
        await this.prisma.$transaction(batch);
      } catch (err) {
        this.logger.warn(
          `Failed to sync ${label} batch (${i}-${i + batchSize}) for ${sessionId}: ${err}`,
        );
      }
    }
  }

  private buildChatUpsert(sessionId: string, chat: Chat): BatchOperation[] {
    if (!chat.id) {
      return [];
    }

    const conversationTimestamp = this.toBigIntTimestamp(
      chat.conversationTimestamp,
    );
    const pinned = this.toOptionalFlag(chat.pinned);
    const muted = this.toOptionalFlag(chat.muteEndTime);

    return [
      this.prisma.chat.upsert({
        where: { sessionId_jid: { sessionId, jid: chat.id } },
        create: {
          sessionId,
          jid: chat.id,
          name: chat.name ?? null,
          conversationTimestamp,
          unreadCount: chat.unreadCount ?? 0,
          archived: Boolean(chat.archived),
          pinned: pinned ?? false,
          muted: muted ?? false,
        },
        update: {
          name: chat.name ?? undefined,
          conversationTimestamp: conversationTimestamp ?? undefined,
          unreadCount: chat.unreadCount ?? undefined,
          archived:
            chat.archived !== undefined ? Boolean(chat.archived) : undefined,
          pinned,
          muted,
        },
      }),
    ];
  }

  private buildMessageUpserts(
    sessionId: string,
    message: WAMessage,
  ): BatchOperation[] {
    const remoteJid = message.key.remoteJid;
    const messageId = message.key.id;
    if (!remoteJid || !messageId) {
      return [];
    }

    const timestamp = toLong(message.messageTimestamp ?? undefined);
    const content = toInputJson(message);
    const messagePayload = this.toMessagePayload(message.message);

    return [
      this.prisma.message.upsert({
        where: {
          sessionId_remoteJid_messageId: { sessionId, remoteJid, messageId },
        },
        create: {
          sessionId,
          remoteJid,
          messageId,
          fromMe: message.key.fromMe ?? false,
          participant: message.key.participant ?? null,
          pushName: message.pushName ?? null,
          messageType: getMessageType(messagePayload),
          content,
          timestamp: new Date(timestamp * 1000),
        },
        update: {
          content,
        },
      }),
    ];
  }

  private toBigIntTimestamp(
    value: number | Long | null | undefined,
  ): bigint | null {
    if (value == null) {
      return null;
    }

    return BigInt(typeof value === 'number' ? value : value.low);
  }

  private toOptionalFlag(
    value: number | Long | null | undefined,
  ): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return false;
    }

    return typeof value === 'number' ? value > 0 : value.low > 0;
  }

  private toMessagePayload(
    value: WAMessage['message'],
  ): Record<string, unknown> | undefined {
    if (!value) {
      return undefined;
    }

    return value as unknown as Record<string, unknown>;
  }
}
