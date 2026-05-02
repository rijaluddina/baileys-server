import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../session/session.service.js';
import {
  CreateGroupDto,
  UpdateGroupSubjectDto,
  UpdateGroupDescriptionDto,
  GroupParticipantActionDto,
  UpdateGroupSettingsDto,
  UpdateGroupPictureDto,
} from './dto/group.dto.js';
import axios from 'axios';

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(private readonly sessionService: SessionService) {}

  async createGroup(sessionId: string, dto: CreateGroupDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const result = await socket.groupCreate(dto.subject, dto.participants);
    return { groupId: result.id, subject: result.subject, participants: result.participants };
  }

  async getAllGroups(sessionId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    const groups = await socket.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({
      id: g.id,
      subject: g.subject,
      owner: g.owner,
      creation: g.creation,
      size: g.size,
      participants: g.participants,
    }));
  }

  async getGroupMetadata(sessionId: string, groupId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    return socket.groupMetadata(groupId);
  }

  async getGroupInviteCode(sessionId: string, groupId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    const code = await socket.groupInviteCode(groupId);
    return { inviteCode: code, link: `https://chat.whatsapp.com/${code}` };
  }

  async revokeGroupInvite(sessionId: string, groupId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    const code = await socket.groupRevokeInvite(groupId);
    return { inviteCode: code, link: `https://chat.whatsapp.com/${code}` };
  }

  async updateGroupSubject(sessionId: string, groupId: string, dto: UpdateGroupSubjectDto) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.groupUpdateSubject(groupId, dto.subject);
    return { status: 'updated' };
  }

  async updateGroupDescription(sessionId: string, groupId: string, dto: UpdateGroupDescriptionDto) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.groupUpdateDescription(groupId, dto.description);
    return { status: 'updated' };
  }

  async updateGroupSettings(sessionId: string, groupId: string, dto: UpdateGroupSettingsDto) {
    const socket = this.sessionService.getSocket(sessionId);
    if (dto.announce !== undefined) {
      await socket.groupSettingUpdate(groupId, dto.announce ? 'announcement' : 'not_announcement');
    }
    if (dto.restrict !== undefined) {
      await socket.groupSettingUpdate(groupId, dto.restrict ? 'locked' : 'unlocked');
    }
    return { status: 'updated' };
  }

  async modifyParticipants(sessionId: string, groupId: string, dto: GroupParticipantActionDto) {
    const socket = this.sessionService.getSocket(sessionId);
    const result = await socket.groupParticipantsUpdate(groupId, dto.participants, dto.action);
    return { results: result };
  }

  async leaveGroup(sessionId: string, groupId: string) {
    const socket = this.sessionService.getSocket(sessionId);
    await socket.groupLeave(groupId);
    return { status: 'left' };
  }

  async joinGroup(sessionId: string, inviteCode: string) {
    const socket = this.sessionService.getSocket(sessionId);
    const result = await socket.groupAcceptInvite(inviteCode);
    return { groupId: result };
  }

  async updateGroupPicture(sessionId: string, groupId: string, dto: UpdateGroupPictureDto) {
    const socket = this.sessionService.getSocket(sessionId);

    let imageBuffer: Buffer;
    if (dto.image.startsWith('http')) {
      const response = await axios.get(dto.image, { responseType: 'arraybuffer' });
      imageBuffer = Buffer.from(response.data);
    } else {
      imageBuffer = Buffer.from(dto.image, 'base64');
    }

    await socket.updateProfilePicture(groupId, imageBuffer);
    return { status: 'updated' };
  }

  async getGroupInviteInfo(sessionId: string, inviteCode: string) {
    const socket = this.sessionService.getSocket(sessionId);
    return socket.groupGetInviteInfo(inviteCode);
  }
}
