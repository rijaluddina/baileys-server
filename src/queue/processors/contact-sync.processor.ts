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

    const operations = contacts.flatMap((contact) => {
      if (!contact.id) return [];

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
    });

    if (operations.length > 0) {
      try {
        await this.prisma.$transaction(operations);
      } catch (err) {
        this.logger.warn(`Failed to sync contacts for session ${sessionId}: ${err}`);
      }
    }

    this.logger.debug(`Synced ${operations.length}/${contacts.length} contacts for session ${sessionId}`);
  }
}
