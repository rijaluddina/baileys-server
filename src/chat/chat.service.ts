import { Injectable, Logger } from '@nestjs/common';
import type { ChatModification } from '@whiskeysockets/baileys';
import { SessionService } from '../session/session.service.js';
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

  constructor(private readonly sessionService: SessionService) {}

  async getChats(sessionId: string, limit = 50, offset = 0) {
    return this.sessionService.getChats(sessionId, limit, offset);
  }

  async archiveChat(sessionId: string, dto: ArchiveChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const modification: ChatModification = { archive: dto.archive, lastMessages: [] };
    await socket.chatModify(modification, dto.jid);
    return { status: dto.archive ? 'archived' : 'unarchived' };
  }

  async pinChat(sessionId: string, dto: PinChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const modification: ChatModification = { pin: dto.pin };
    await socket.chatModify(modification, dto.jid);
    return { status: dto.pin ? 'pinned' : 'unpinned' };
  }

  async muteChat(sessionId: string, dto: MuteChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const mute = dto.duration === 0 ? null : (dto.duration ?? 8 * 60 * 60 * 1000);
    const modification: ChatModification = { mute: mute ? Date.now() + mute : null };
    await socket.chatModify(modification, dto.jid);
    return { status: mute ? 'muted' : 'unmuted' };
  }

  async markChatRead(sessionId: string, dto: MarkChatReadDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const modification: ChatModification = { markRead: dto.read, lastMessages: [] };
    await socket.chatModify(modification, dto.jid);
    return { status: dto.read ? 'read' : 'unread' };
  }

  async deleteChat(sessionId: string, dto: DeleteChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const modification: ChatModification = { delete: true, lastMessages: [] };
    await socket.chatModify(modification, dto.jid);
    return { status: 'deleted' };
  }

  async fetchMessages(sessionId: string, jid: string, dto: FetchMessagesDto) {
    // Now reads from database with pagination
    const limit = dto.limit || 25;
    return this.sessionService.getMessages(sessionId, jid, limit);
  }
}
