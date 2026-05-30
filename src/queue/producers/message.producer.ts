import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants.js';

interface SendMessageJobData {
  idempotencyKey: string;
  tenantId: string;
  sessionId: string;
  to: string;
  content: Record<string, unknown>;
  options?: {
    quoted?: string;
    ephemeral?: number;
    mentions?: string[];
  };
  priority: 'high' | 'normal' | 'low';
  correlationId: string;
  createdAt: string;
}

@Injectable()
export class MessageProducer {
  private readonly logger = new Logger(MessageProducer.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.MESSAGE_SEND)
    private readonly messageSendQueue: Queue<SendMessageJobData>,
  ) {}

  async send(
    sessionId: string,
    to: string,
    content: Record<string, unknown>,
    options: {
      idempotencyKey?: string;
      quoted?: string;
      ephemeral?: number;
      mentions?: string[];
      priority?: 'high' | 'normal' | 'low';
      correlationId?: string;
    } = {},
  ) {
    const jobData: SendMessageJobData = {
      idempotencyKey:
        options.idempotencyKey ?? `${sessionId}:${to}:${Date.now()}`,
      tenantId: 'default',
      sessionId,
      to,
      content,
      options: {
        quoted: options.quoted,
        ephemeral: options.ephemeral,
        mentions: options.mentions,
      },
      priority: options.priority ?? 'normal',
      correlationId: options.correlationId ?? '',
      createdAt: new Date().toISOString(),
    };

    const jobName = `send-${sessionId}-${to}-${Date.now()}`;

    const job = await this.messageSendQueue.add(jobName, jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      priority:
        options.priority === 'high' ? 1 : options.priority === 'low' ? 3 : 2,
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.debug(
      `Queued message send job for session ${sessionId} to ${to}`,
    );
    return { jobName, sessionId, to, jobId: job.id };
  }

  async sendBulk(
    sessionId: string,
    recipients: string[],
    content: Record<string, unknown>,
    options: {
      priority?: 'high' | 'normal' | 'low';
      correlationId?: string;
    } = {},
  ) {
    const jobs = recipients.map((to, index) => ({
      name: `bulk-send-${sessionId}-${to}-${Date.now()}-${index}`,
      data: {
        idempotencyKey: `bulk:${sessionId}:${to}:${Date.now()}:${index}`,
        tenantId: 'default',
        sessionId,
        to,
        content,
        options: {},
        priority: options.priority ?? 'normal',
        correlationId: options.correlationId ?? '',
        createdAt: new Date().toISOString(),
      },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        priority: options.priority === 'high' ? 1 : 2,
        removeOnComplete: true,
        removeOnFail: false,
      },
    }));

    await this.messageSendQueue.addBulk(jobs);
    this.logger.debug(
      `Queued bulk message send (${recipients.length} recipients) for session ${sessionId}`,
    );
    return { count: recipients.length, sessionId };
  }
}
