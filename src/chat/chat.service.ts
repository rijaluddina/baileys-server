import { Injectable, Logger } from '@nestjs/common';
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

  async getChats(sessionId: string) {
    // In Baileys v7, there's no built-in store for chats.
    // We return session info indicating chats are delivered via events/webhooks.
    this.sessionService.getSocket(sessionId); // validate session exists & connected
    return { message: 'Chats are delivered in real-time via webhook/websocket events (chats.upsert, chats.update)' };
  }

  async archiveChat(sessionId: string, dto: ArchiveChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.chatModify(
      { archive: dto.archive, lastMessages: [] } as any,
      dto.jid,
    );
    return { status: dto.archive ? 'archived' : 'unarchived' };
  }

  async pinChat(sessionId: string, dto: PinChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.chatModify(
      { pin: dto.pin } as any,
      dto.jid,
    );
    return { status: dto.pin ? 'pinned' : 'unpinned' };
  }

  async muteChat(sessionId: string, dto: MuteChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const mute = dto.duration === 0 ? null : (dto.duration ?? 8 * 60 * 60 * 1000);
    await socket.chatModify(
      { mute: mute ? Date.now() + mute : null } as any,
      dto.jid,
    );
    return { status: mute ? 'muted' : 'unmuted' };
  }

  async markChatRead(sessionId: string, dto: MarkChatReadDto) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.chatModify(
      { markRead: dto.read, lastMessages: [] } as any,
      dto.jid,
    );
    return { status: dto.read ? 'read' : 'unread' };
  }

  async deleteChat(sessionId: string, dto: DeleteChatDto) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.chatModify(
      { delete: true, lastMessages: [] } as any,
      dto.jid,
    );
    return { status: 'deleted' };
  }

  async fetchMessages(sessionId: string, jid: string, dto: FetchMessagesDto) {
    const limit = dto.limit || 25;
    const messages = this.sessionService.getMessages(sessionId, jid, limit);
    return messages;
  }
}
