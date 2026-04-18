import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../session/session.service.js';
import {
  SetPresenceDto,
  UpdatePrivacyDto,
  CreateNewsletterDto,
  SendNewsletterMessageDto,
} from './dto/misc.dto.js';

@Injectable()
export class MiscService {
  private readonly logger = new Logger(MiscService.name);

  constructor(private readonly sessionService: SessionService) {}

  // === Presence ===
  async setPresence(sessionId: string, dto: SetPresenceDto) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.sendPresenceUpdate(dto.presence as any, dto.jid);
    return { status: 'updated', presence: dto.presence };
  }

  async subscribePresence(sessionId: string, jid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.presenceSubscribe(jid);
    return { status: 'subscribed', jid };
  }

  // === Labels ===
  async getLabels(sessionId: string) {
    // Labels are delivered via events (labels.edit, labels.association)
    this.sessionService.getSocket(sessionId);
    return { message: 'Labels are delivered in real-time via webhook/websocket events (labels.edit, labels.association)' };
  }

  async addChatLabel(sessionId: string, jid: string, labelId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.addChatLabel(jid, labelId);
    return { status: 'assigned' };
  }

  async removeChatLabel(sessionId: string, jid: string, labelId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.removeChatLabel(jid, labelId);
    return { status: 'removed' };
  }

  async addMessageLabel(sessionId: string, jid: string, messageId: string, labelId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.addMessageLabel(jid, messageId, labelId);
    return { status: 'assigned' };
  }

  async removeMessageLabel(sessionId: string, jid: string, messageId: string, labelId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.removeMessageLabel(jid, messageId, labelId);
    return { status: 'removed' };
  }

  // === Privacy ===
  async getPrivacySettings(sessionId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    return socket.fetchPrivacySettings(true);
  }

  async updateLastSeenPrivacy(sessionId: string, value: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateLastSeenPrivacy(value as any);
    return { status: 'updated', setting: 'last-seen', value };
  }

  async updateOnlinePrivacy(sessionId: string, value: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateOnlinePrivacy(value as any);
    return { status: 'updated', setting: 'online', value };
  }

  async updateProfilePicturePrivacy(sessionId: string, value: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateProfilePicturePrivacy(value as any);
    return { status: 'updated', setting: 'profile-picture', value };
  }

  async updateStatusPrivacy(sessionId: string, value: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateStatusPrivacy(value as any);
    return { status: 'updated', setting: 'status', value };
  }

  async updateReadReceiptsPrivacy(sessionId: string, value: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateReadReceiptsPrivacy(value as any);
    return { status: 'updated', setting: 'read-receipts', value };
  }

  async updateGroupsAddPrivacy(sessionId: string, value: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.updateGroupsAddPrivacy(value as any);
    return { status: 'updated', setting: 'groups', value };
  }

  // === Newsletter / Channel ===
  async createNewsletter(sessionId: string, dto: CreateNewsletterDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const result = await socket.newsletterCreate(dto.name, dto.description);
    return result;
  }

  async followNewsletter(sessionId: string, newsletterJid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.newsletterFollow(newsletterJid);
    return { status: 'followed' };
  }

  async unfollowNewsletter(sessionId: string, newsletterJid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.newsletterUnfollow(newsletterJid);
    return { status: 'unfollowed' };
  }

  async muteNewsletter(sessionId: string, newsletterJid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.newsletterMute(newsletterJid);
    return { status: 'muted' };
  }

  async unmuteNewsletter(sessionId: string, newsletterJid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.newsletterUnmute(newsletterJid);
    return { status: 'unmuted' };
  }

  async getNewsletterInfo(sessionId: string, newsletterJid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    return socket.newsletterMetadata('jid', newsletterJid);
  }

  async sendNewsletterMessage(sessionId: string, dto: SendNewsletterMessageDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const result = await socket.sendMessage(dto.newsletterJid, { text: dto.text });
    return { messageId: result?.key?.id, status: 'sent' };
  }

  async getNewsletterSubscribers(sessionId: string, newsletterJid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    return socket.newsletterSubscribers(newsletterJid);
  }

  async updateNewsletterName(sessionId: string, newsletterJid: string, name: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.newsletterUpdateName(newsletterJid, name);
    return { status: 'updated' };
  }

  async updateNewsletterDescription(sessionId: string, newsletterJid: string, description: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.newsletterUpdateDescription(newsletterJid, description);
    return { status: 'updated' };
  }

  async deleteNewsletter(sessionId: string, newsletterJid: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.newsletterDelete(newsletterJid);
    return { status: 'deleted' };
  }

  async newsletterReactMessage(sessionId: string, newsletterJid: string, serverId: string, reaction?: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.newsletterReactMessage(newsletterJid, serverId, reaction);
    return { status: 'reacted' };
  }

  async newsletterFetchMessages(sessionId: string, newsletterJid: string, count: number, since: number, after: number) {
    const socket = this.sessionService.getSocket(sessionId);
    return socket.newsletterFetchMessages(newsletterJid, count, since, after);
  }

  // === Blocklist ===
  async getBlocklist(sessionId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    return socket.fetchBlocklist();
  }

  // === Device Info ===
  async getDeviceInfo(sessionId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    return {
      user: socket.user,
      authState: socket.authState?.creds?.me,
    };
  }
}
