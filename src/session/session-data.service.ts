import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client/client.js';
import { WAMessage } from 'baileys';

@Injectable()
export class SessionDataService {
  constructor(private readonly prisma: PrismaService) {}

  async getMessages(
    sessionId: string,
    jid: string,
    limit = 25,
    cursor?: string,
  ) {
    const dbSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!dbSession)
      throw new NotFoundException(`Session "${sessionId}" not found`);

    const where: Prisma.MessageWhereInput = { sessionId, remoteJid: jid };
    if (cursor) {
      where.id = { lt: cursor };
    }

    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return {
      messages,
      nextCursor:
        messages.length === limit ? messages[messages.length - 1].id : null,
    };
  }

  async getContacts(
    sessionId: string,
    search?: string,
    limit = 50,
    offset = 0,
  ) {
    const dbSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!dbSession)
      throw new NotFoundException(`Session "${sessionId}" not found`);

    const where: Prisma.ContactWhereInput = { sessionId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { notify: { contains: search, mode: 'insensitive' } },
        { jid: { contains: search, mode: 'insensitive' } },
      ];

      // If search is numeric, also search JID without the suffix
      const cleanedSearch = search.replace(/[^0-9]/g, '');
      if (cleanedSearch && cleanedSearch.length > 3) {
        where.OR.push({ jid: { contains: cleanedSearch } });
      }
    }

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { contacts, total, limit, offset };
  }

  async getChats(sessionId: string, limit = 50, offset = 0) {
    const dbSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!dbSession)
      throw new NotFoundException(`Session "${sessionId}" not found`);

    const [chats, total] = await Promise.all([
      this.prisma.chat.findMany({
        where: { sessionId },
        orderBy: { conversationTimestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.chat.count({ where: { sessionId } }),
    ]);

    const serializedChats = chats.map((c) => ({
      ...c,
      conversationTimestamp: c.conversationTimestamp
        ? Number(c.conversationTimestamp)
        : null,
    }));

    return { chats: serializedChats, total, limit, offset };
  }

  async getWebhookLogs(sessionId: string, limit = 50, offset = 0) {
    const dbSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!dbSession)
      throw new NotFoundException(`Session "${sessionId}" not found`);

    const [logs, total] = await Promise.all([
      this.prisma.webhookLog.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.webhookLog.count({ where: { sessionId } }),
    ]);

    return { logs, total, limit, offset };
  }

  async findMessage(
    sessionId: string,
    jid: string,
    messageId: string,
  ): Promise<WAMessage | undefined> {
    const storedMessage = await this.prisma.message.findFirst({
      where: { sessionId, remoteJid: jid, messageId },
    });

    return storedMessage?.content as unknown as WAMessage | undefined;
  }

  async getLastMessage(
    sessionId: string,
    jid: string,
  ): Promise<WAMessage | undefined> {
    const storedMessage = await this.prisma.message.findFirst({
      where: { sessionId, remoteJid: jid },
      orderBy: { timestamp: 'desc' },
    });

    if (!storedMessage) return undefined;

    return {
      key: {
        remoteJid: storedMessage.remoteJid,
        fromMe: storedMessage.fromMe,
        id: storedMessage.messageId,
      },
      messageTimestamp: Math.floor(storedMessage.timestamp.getTime() / 1000),
    };
  }
}
