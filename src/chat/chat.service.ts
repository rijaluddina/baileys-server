import { Injectable, Logger } from '@nestjs/common';
import type { ChatModification } from 'baileys';
import { SessionService } from '../session/session.service.js';
import { SessionDataService } from '../session/session-data.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatJid } from '../common/utils/baileys-helpers.js';
import {
  ArchiveChatDto,
  PinChatDto,
  MuteChatDto,
  DeleteChatDto,
  FetchMessagesDto,
  MarkChatReadDto,
} from './dto/chat.dto.js';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionDataService: SessionDataService,
    private readonly prisma: PrismaService,
  ) {}

  async getChats(sessionId: string, limit = 50, offset = 0) {
    return this.sessionDataService.getChats(sessionId, limit, offset);
  }

  async archiveChat(sessionId: string, dto: ArchiveChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = formatJid(dto.jid);
    const lastMessage = await this.sessionDataService.getLastMessage(
      sessionId,
      jid,
    );
    const modification: ChatModification = {
      archive: dto.archive,
      lastMessages: lastMessage ? [lastMessage] : [],
    };
    await socket.chatModify(modification, jid);
    await this.prisma.chat.updateMany({
      where: { sessionId, jid },
      data: { archived: dto.archive },
    });
    return { status: dto.archive ? 'archived' : 'unarchived' };
  }

  async pinChat(sessionId: string, dto: PinChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = formatJid(dto.jid);
    await socket.chatModify({ pin: dto.pin }, jid);
    await this.prisma.chat.updateMany({
      where: { sessionId, jid },
      data: { pinned: dto.pin },
    });
    return { status: dto.pin ? 'pinned' : 'unpinned' };
  }

  async muteChat(sessionId: string, dto: MuteChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = formatJid(dto.jid);
    // duration=0 means unmute (null), undefined defaults to 8 hours
    const durationMs =
      dto.duration === 0 ? null : (dto.duration ?? 8 * 60 * 60 * 1000);
    await socket.chatModify({ mute: durationMs }, jid);
    await this.prisma.chat.updateMany({
      where: { sessionId, jid },
      data: { muted: durationMs !== null },
    });
    return { status: durationMs !== null ? 'muted' : 'unmuted' };
  }

  async markChatRead(sessionId: string, dto: MarkChatReadDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = formatJid(dto.jid);
    const lastMessage = await this.sessionDataService.getLastMessage(
      sessionId,
      jid,
    );
    const modification: ChatModification = {
      markRead: dto.read,
      lastMessages: lastMessage ? [lastMessage] : [],
    };
    await socket.chatModify(modification, jid);
    await this.prisma.chat.updateMany({
      where: { sessionId, jid },
      data: { unreadCount: dto.read ? 0 : -1 },
    });
    return { status: dto.read ? 'read' : 'unread' };
  }

  async deleteChat(sessionId: string, dto: DeleteChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const jid = formatJid(dto.jid);
    const lastMessage = await this.sessionDataService.getLastMessage(
      sessionId,
      jid,
    );
    const modification: ChatModification = {
      delete: true,
      lastMessages: lastMessage ? [lastMessage] : [],
    };
    await socket.chatModify(modification, jid);
    await this.prisma.chat.deleteMany({ where: { sessionId, jid } });
    return { status: 'deleted' };
  }

  async fetchMessages(sessionId: string, jid: string, dto: FetchMessagesDto) {
    const limit = dto.limit || 25;
    return this.sessionDataService.getMessages(
      sessionId,
      jid,
      limit,
      dto.before,
    );
  }
}
