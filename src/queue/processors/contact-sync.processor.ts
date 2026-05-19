import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_NAMES } from '../queue.constants.js';

interface ContactJob {
  sessionId: string;
  contacts: Array<{
    id: string;
    name?: string;
    notify?: string;
    imgUrl?: string;
    status?: string;
  }>;
}

@Processor(QUEUE_NAMES.CONTACT_SYNC)
export class ContactSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ContactSyncProcessor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ContactJob>): Promise<void> {
    const { sessionId, contacts } = job.data;

    if (contacts.length > 0) {
      try {
        const results = await Promise.allSettled(
          contacts.map((contact) => {
            if (!contact.id) return Promise.resolve();

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
          }),
        );

        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
          this.logger.warn(
            `Failed to sync ${failed.length} contacts for session ${sessionId}. First error: ${
              (failed[0] as PromiseRejectedResult).reason
            }`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Critical failure during contact sync for session ${sessionId}: ${err}`,
        );
      }
    }

    this.logger.debug(
      `Sync process finished for ${contacts.length} contacts in session ${sessionId}`,
    );
  }
}
