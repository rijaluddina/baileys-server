import { Job } from 'bullmq';
import { ContactSyncProcessor } from './contact-sync.processor';

describe('ContactSyncProcessor', () => {
  it('syncs valid contacts in a single transaction', async () => {
    const contactOperation = { model: 'contact', action: 'upsert' };
    const prisma = {
      contact: {
        upsert: jest.fn().mockReturnValue(contactOperation),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const processor = new ContactSyncProcessor(prisma as never);
    const job = {
      data: {
        sessionId: 'session-1',
        contacts: [
          { id: '6281234567890@s.whatsapp.net', name: 'Rijal' },
          { id: '' },
        ],
      },
    } as Job<never>;

    await processor.process(job);

    expect(prisma.contact.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_jid: {
            sessionId: 'session-1',
            jid: '6281234567890@s.whatsapp.net',
          },
        },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith([contactOperation]);
  });
});
