import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
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

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ContactJob>): Promise<void> {
    const { sessionId, contacts } = job.data;

    let synced = 0;
    for (const contact of contacts) {
      if (!contact.id) continue;

      try {
        await this.prisma.contact.upsert({
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
        synced++;
      } catch (err) {
        this.logger.warn(
          `Failed to sync contact ${contact.id} for session ${sessionId}: ${err}`,
        );
      }
    }

    this.logger.debug(`Synced ${synced}/${contacts.length} contacts for session ${sessionId}`);
  }
}
