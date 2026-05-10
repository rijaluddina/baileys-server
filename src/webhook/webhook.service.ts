import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WebhookProducer } from '../queue/producers/webhook.producer.js';

export interface CreateWebhookDto {
  sessionId: string;
  name: string;
  url: string;
  secret?: string;
  events?: string[];
  headers?: Record<string, string>;
  active?: boolean;
  maxRetries?: number;
}

export interface UpdateWebhookDto {
  name?: string;
  url?: string;
  secret?: string;
  events?: string[];
  headers?: Record<string, string>;
  active?: boolean;
  maxRetries?: number;
}

export interface WebhookDeliveryResult {
  success: boolean;
  attempts: number;
  statusCode?: number;
  error?: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookProducer: WebhookProducer,
  ) {}

  async create(dto: CreateWebhookDto) {
    return this.prisma.webhook.create({
      data: {
        sessionId: dto.sessionId,
        name: dto.name,
        url: dto.url,
        secret: dto.secret,
        events: dto.events ?? [],
        headers: dto.headers ?? {},
        active: dto.active ?? true,
        maxRetries: dto.maxRetries ?? 3,
      },
    });
  }

  async findAll(sessionId: string) {
    return this.prisma.webhook.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, sessionId: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, sessionId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook "${id}" not found`);
    }

    return webhook;
  }

  async update(id: string, sessionId: string, dto: UpdateWebhookDto) {
    await this.findOne(id, sessionId);

    return this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.secret !== undefined && { secret: dto.secret }),
        ...(dto.events !== undefined && { events: dto.events }),
        ...(dto.headers !== undefined && { headers: dto.headers }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.maxRetries !== undefined && { maxRetries: dto.maxRetries }),
      },
    });
  }

  async delete(id: string, sessionId: string) {
    await this.findOne(id, sessionId);
    await this.prisma.webhook.delete({ where: { id } });
    return { deleted: true };
  }

  async toggleActive(id: string, sessionId: string) {
    const webhook = await this.findOne(id, sessionId);
    return this.prisma.webhook.update({
      where: { id },
      data: { active: !webhook.active },
    });
  }

  async deliver(
    webhookId: string,
    sessionId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    const webhook = await this.findOne(webhookId, sessionId);

    if (!webhook.active) {
      this.logger.debug(
        `Webhook "${webhookId}" is inactive, skipping delivery`,
      );
      return { success: false, attempts: 0, error: 'Webhook inactive' };
    }

    if (webhook.events.length > 0 && !webhook.events.includes(event)) {
      this.logger.debug(`Event "${event}" not in webhook filter, skipping`);
      return { success: true, attempts: 0 };
    }

    const result = await this.webhookProducer.deliver(
      webhookId,
      sessionId,
      event,
      payload,
      webhook.url,
      {
        secret: webhook.secret ?? undefined,
        headers: webhook.headers as Record<string, string>,
      },
    );

    return result;
  }

  async getDeliveryLogs(
    webhookId: string,
    sessionId: string,
    page = 1,
    limit = 20,
  ) {
    await this.findOne(webhookId, sessionId);

    const logs = await this.prisma.webhookLog.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await this.prisma.webhookLog.count({ where: { sessionId } });

    return {
      data: logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
