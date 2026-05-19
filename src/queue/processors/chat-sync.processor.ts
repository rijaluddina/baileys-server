import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_NAMES } from '../queue.constants.js';

interface ChatJob {
  sessionId: string;
  chats: Array<{
    id: string;
    name?: string;
    conversationTimestamp?: number | { low: number };
    unreadCount?: number;
    // chats.upsert fields
    archive?: boolean;
    pin?: boolean | number;
    mute?: number | null;
    // chats.update fields (from Baileys processSyncAction)
    archived?: boolean;
    pinned?: number | null;
    muteEndTime?: number | null;
  }>;
}

@Processor(QUEUE_NAMES.CHAT_SYNC)
export class ChatSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatSyncProcessor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ChatJob>): Promise<void> {
    const { sessionId, chats } = job.data;

    if (chats.length > 0) {
      try {
        const results = await Promise.allSettled(
          chats.map((chat) => {
            if (!chat.id) return Promise.resolve();

            const ts = chat.conversationTimestamp;
            const conversationTimestamp = ts
              ? BigInt(typeof ts === 'number' ? ts : ts.low)
              : null;

            // Normalize field names: Baileys uses both archive/archived, pin/pinned, mute/muteEndTime
            const archivedValue =
              chat.archived ??
              (chat.archive !== undefined ? chat.archive : undefined);
            const pinnedValue =
              chat.pinned !== undefined
                ? chat.pinned !== null && chat.pinned > 0
                : chat.pin !== undefined
                  ? !!chat.pin
                  : undefined;
            const mutedValue =
              chat.muteEndTime !== undefined
                ? chat.muteEndTime !== null && chat.muteEndTime > 0
                : chat.mute !== undefined
                  ? chat.mute !== null && chat.mute > 0
                  : undefined;

            return this.prisma.chat.upsert({
              where: { sessionId_jid: { sessionId, jid: chat.id } },
              create: {
                sessionId,
                jid: chat.id,
                name: chat.name ?? null,
                conversationTimestamp,
                unreadCount: chat.unreadCount ?? 0,
                archived: archivedValue ?? false,
                pinned: pinnedValue ?? false,
                muted: mutedValue ?? false,
              },
              update: {
                ...(chat.name !== undefined && { name: chat.name }),
                ...(conversationTimestamp !== null && { conversationTimestamp }),
                ...(chat.unreadCount !== undefined && {
                  unreadCount: chat.unreadCount,
                }),
                ...(archivedValue !== undefined && { archived: archivedValue }),
                ...(pinnedValue !== undefined && { pinned: pinnedValue }),
                ...(mutedValue !== undefined && { muted: mutedValue }),
              },
            });
          }),
        );

        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
          this.logger.warn(
            `Failed to sync ${failed.length} chats for session ${sessionId}. First error: ${
              (failed[0] as PromiseRejectedResult).reason
            }`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Critical failure during chat sync for session ${sessionId}: ${err}`,
        );
      }
    }

    this.logger.debug(
      `Sync process finished for ${chats.length} chats in session ${sessionId}`,
    );
  }
}
