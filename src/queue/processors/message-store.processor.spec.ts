import { Job } from 'bullmq';
import { MessageStoreProcessor } from './message-store.processor.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type MessageStoreJob = {
  sessionId: string;
  messages: Array<{
    key: {
      remoteJid?: string;
      id?: string;
      fromMe?: boolean;
    };
    messageTimestamp?: number;
    message?: { conversation: string };
  }>;
};

type MockPrisma = {
  message: {
    upsert: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('MessageStoreProcessor', () => {
  it('stores valid messages in a single transaction', async () => {
    const messageOperation = { model: 'message', action: 'upsert' };
    const prisma: MockPrisma = {
      message: {
        upsert: jest.fn().mockReturnValue(messageOperation),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const processor = new MessageStoreProcessor(prisma as PrismaService);
    const job = {
      data: {
        sessionId: 'session-1',
        messages: [
          {
            key: {
              remoteJid: '6281234567890@s.whatsapp.net',
              id: 'message-1',
              fromMe: true,
            },
            messageTimestamp: 1714600000,
            message: { conversation: 'hello' },
          },
          {
            key: {
              remoteJid: '6281234567890@s.whatsapp.net',
            },
          },
        ],
      },
    } as Job<MessageStoreJob>;

    await processor.process(job);

    expect(prisma.message.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.message.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_remoteJid_messageId: {
            sessionId: 'session-1',
            remoteJid: '6281234567890@s.whatsapp.net',
            messageId: 'message-1',
          },
        },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith([messageOperation]);
  });
});
