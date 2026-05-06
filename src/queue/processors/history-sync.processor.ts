import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Chat, Contact, WAMessage } from '@whiskeysockets/baileys';
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

  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  /* eslint-disable @typescript-eslint/no-unsafe-argument */
  async process(job: Job<HistorySyncJob>): Promise<void> {
    const { sessionId, data } = job.data;
    const { chats = [], contacts = [], messages = [] } = data;

    this.logger.log(
      `Processing history sync for session ${sessionId}: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`,
    );

    // 1. Sync Chats
    if (chats.length > 0) {
      const chatOps = chats.map((chat: any) => {
        const ts = chat.conversationTimestamp;
        const conversationTimestamp = ts
          ? BigInt(typeof ts === 'number' ? ts : (ts as unknown as Long).low)
          : null;

        return this.prisma.chat.upsert({
          where: { sessionId_jid: { sessionId, jid: chat.id as string } },
          create: {
            sessionId,
            jid: chat.id as string,
            name: chat.name ?? null,
            conversationTimestamp,
            unreadCount: chat.unreadCount ?? 0,
            archived: !!chat.archived,
            pinned:
              chat.pinned != null &&
              (typeof chat.pinned === 'number'
                ? chat.pinned > 0
                : (chat.pinned as unknown as Long).low > 0),
            muted:
              chat.muteEndTime != null &&
              (typeof chat.muteEndTime === 'number'
                ? chat.muteEndTime > 0
                : (chat.muteEndTime as unknown as Long).low > 0),
          },
          update: {
            name: chat.name ?? undefined,
            conversationTimestamp: conversationTimestamp ?? undefined,
            unreadCount: chat.unreadCount ?? undefined,
            archived: chat.archived !== undefined ? !!chat.archived : undefined,
            pinned:
              chat.pinned !== undefined
                ? chat.pinned != null &&
                  (typeof chat.pinned === 'number'
                    ? chat.pinned > 0
                    : (chat.pinned as unknown as Long).low > 0)
                : undefined,
            muted:
              chat.muteEndTime !== undefined
                ? chat.muteEndTime != null &&
                  (typeof chat.muteEndTime === 'number'
                    ? chat.muteEndTime > 0
                    : (chat.muteEndTime as unknown as Long).low > 0)
                : undefined,
          },
        });
      });
      await this.runBatched(chatOps, 'chats', sessionId);
    }

    // 2. Sync Contacts
    if (contacts.length > 0) {
      const contactOps = contacts.map((contact: any) => ({
        sessionId,
        jid: contact.id as string,
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
      const messageOps = messages.flatMap((msg: any) => {
        const remoteJid = msg.key?.remoteJid;
        const messageId = msg.key?.id;
        if (!remoteJid || !messageId) return [];

        const ts = toLong(msg.messageTimestamp ?? undefined);
        const content = toInputJson(msg);

        return this.prisma.message.upsert({
          where: {
            sessionId_remoteJid_messageId: { sessionId, remoteJid, messageId },
          },
          create: {
            sessionId,
            remoteJid,
            messageId,
            fromMe: msg.key.fromMe ?? false,
            participant: msg.key.participant ?? null,
            pushName: msg.pushName ?? null,
            messageType: getMessageType(msg.message ?? undefined),
            content,
            timestamp: new Date(ts * 1000),
          },
          update: {
            content,
          },
        });
      });
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
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  /* eslint-enable @typescript-eslint/no-unsafe-argument */

  private async runBatched(
    ops: any[],
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
}
