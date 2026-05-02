import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_NAMES } from '../queue.constants.js';

@Processor(QUEUE_NAMES.MESSAGE_CLEANUP)
export class MessageCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageCleanupProcessor.name);
  private readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super();
    this.retentionDays = this.configService.get<number>('MESSAGE_RETENTION_DAYS', 60);
  }

  async process(_job: Job): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    this.logger.log(`Cleaning up messages older than ${this.retentionDays} days (before ${cutoffDate.toISOString()})`);

    // Delete old messages
    const deletedMessages = await this.prisma.message.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    this.logger.log(`Deleted ${deletedMessages.count} old messages`);

    // Delete old webhook logs (keep for 30 days)
    const webhookCutoff = new Date();
    webhookCutoff.setDate(webhookCutoff.getDate() - 30);

    const deletedLogs = await this.prisma.webhookLog.deleteMany({
      where: {
        createdAt: { lt: webhookCutoff },
      },
    });

    this.logger.log(`Deleted ${deletedLogs.count} old webhook logs`);
  }
}
