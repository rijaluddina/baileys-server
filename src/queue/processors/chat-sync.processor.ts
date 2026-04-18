import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
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
    archive?: boolean;
    pin?: boolean | number;
    mute?: number | null;
  }>;
}

@Processor(QUEUE_NAMES.CHAT_SYNC)
export class ChatSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatSyncProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ChatJob>): Promise<void> {
    const { sessionId, chats } = job.data;

    let synced = 0;
    for (const chat of chats) {
      if (!chat.id) continue;

      try {
        const ts = chat.conversationTimestamp;
        const conversationTimestamp = ts
          ? BigInt(typeof ts === 'number' ? ts : ts.low)
          : null;

        await this.prisma.chat.upsert({
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
            conversationTimestamp,
            unreadCount: chat.unreadCount ?? 0,
            archived: chat.archive ?? false,
            pinned: !!chat.pin,
            muted: chat.mute != null && chat.mute > 0,
          },
          update: {
            name: chat.name ?? undefined,
            conversationTimestamp: conversationTimestamp ?? undefined,
            unreadCount: chat.unreadCount ?? undefined,
            archived: chat.archive ?? undefined,
            pinned: chat.pin !== undefined ? !!chat.pin : undefined,
            muted: chat.mute !== undefined ? (chat.mute != null && chat.mute > 0) : undefined,
          },
        });
        synced++;
      } catch (err) {
        this.logger.warn(
          `Failed to sync chat ${chat.id} for session ${sessionId}: ${err}`,
        );
      }
    }

    this.logger.debug(`Synced ${synced}/${chats.length} chats for session ${sessionId}`);
  }
}
