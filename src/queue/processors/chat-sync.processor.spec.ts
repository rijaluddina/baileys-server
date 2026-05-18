import { Job } from 'bullmq';
import { ChatSyncProcessor } from './chat-sync.processor.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type ChatSyncJob = {
  sessionId: string;
  chats: Array<{
    id: string;
    name?: string;
    conversationTimestamp?: { low: number };
  }>;
};

type MockPrisma = {
  chat: {
    upsert: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('ChatSyncProcessor', () => {
  it('syncs valid chats in a single transaction', async () => {
    const chatOperation = { model: 'chat', action: 'upsert' };
    const prisma: MockPrisma = {
      chat: {
        upsert: jest.fn().mockReturnValue(chatOperation),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const processor = new ChatSyncProcessor(prisma as PrismaService);
    const job = {
      data: {
        sessionId: 'session-1',
        chats: [
          {
            id: '6281234567890@s.whatsapp.net',
            name: 'Chat',
            conversationTimestamp: { low: 1714600000 },
          },
          { id: '' },
        ],
      },
    } as Job<ChatSyncJob>;

    await processor.process(job);

    expect(prisma.chat.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.chat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_jid: {
            sessionId: 'session-1',
            jid: '6281234567890@s.whatsapp.net',
          },
        },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith([chatOperation]);
  });
});
