import { Controller, Post, Get, Put, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam } from '@nestjs/swagger';
import { GroupService } from './group.service.js';
import {
  CreateGroupDto,
  UpdateGroupSubjectDto,
  UpdateGroupDescriptionDto,
  GroupParticipantActionDto,
  UpdateGroupSettingsDto,
  JoinGroupDto,
  UpdateGroupPictureDto,
} from './dto/group.dto.js';

@ApiTags('Group')
@ApiSecurity('x-api-key')
@Controller(':sessionId/groups')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new group' })
  @ApiParam({ name: 'sessionId' })
  create(@Param('sessionId') sessionId: string, @Body() dto: CreateGroupDto) {
    return this.groupService.createGroup(sessionId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all groups' })
  @ApiParam({ name: 'sessionId' })
  getAll(@Param('sessionId') sessionId: string) {
    return this.groupService.getAllGroups(sessionId);
  }

  @Get(':groupId')
  @ApiOperation({ summary: 'Get group metadata' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'groupId' })
  getMetadata(@Param('sessionId') sessionId: string, @Param('groupId') groupId: string) {
    return this.groupService.getGroupMetadata(sessionId, groupId);
  }

  @Get(':groupId/invite-code')
  @ApiOperation({ summary: 'Get group invite code' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'groupId' })
  getInviteCode(@Param('sessionId') sessionId: string, @Param('groupId') groupId: string) {
    return this.groupService.getGroupInviteCode(sessionId, groupId);
  }

  @Post(':groupId/revoke-invite')
  @ApiOperation({ summary: 'Revoke and regenerate group invite link' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'groupId' })
  revokeInvite(@Param('sessionId') sessionId: string, @Param('groupId') groupId: string) {
    return this.groupService.revokeGroupInvite(sessionId, groupId);
  }

  @Put(':groupId/subject')
  @ApiOperation({ summary: 'Update group subject/name' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'groupId' })
  updateSubject(
    @Param('sessionId') sessionId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupSubjectDto,
  ) {
    return this.groupService.updateGroupSubject(sessionId, groupId, dto);
  }

  @Put(':groupId/description')
  @ApiOperation({ summary: 'Update group description' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'groupId' })
  updateDescription(
    @Param('sessionId') sessionId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDescriptionDto,
  ) {
    return this.groupService.updateGroupDescription(sessionId, groupId, dto);
  }

  @Put(':groupId/settings')
  @ApiOperation({ summary: 'Update group settings (announce/restrict)' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'groupId' })
  updateSettings(
    @Param('sessionId') sessionId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupSettingsDto,
  ) {
    return this.groupService.updateGroupSettings(sessionId, groupId, dto);
  }

  @Post(':groupId/participants')
  @ApiOperation({ summary: 'Add, remove, promote or demote participants' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'groupId' })
  modifyParticipants(
    @Param('sessionId') sessionId: string,
    @Param('groupId') groupId: string,
    @Body() dto: GroupParticipantActionDto,
  ) {
    return this.groupService.modifyParticipants(sessionId, groupId, dto);
  }

  @Delete(':groupId/leave')
  @ApiOperation({ summary: 'Leave a group' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'groupId' })
  leave(@Param('sessionId') sessionId: string, @Param('groupId') groupId: string) {
    return this.groupService.leaveGroup(sessionId, groupId);
  }

  @Post('join')
  @ApiOperation({ summary: 'Join a group via invite code' })
  @ApiParam({ name: 'sessionId' })
  join(@Param('sessionId') sessionId: string, @Body() dto: JoinGroupDto) {
    return this.groupService.joinGroup(sessionId, dto.inviteCode);
  }

  @Put(':groupId/picture')
  @ApiOperation({ summary: 'Update group profile picture' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'groupId' })
  updatePicture(
    @Param('sessionId') sessionId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupPictureDto,
  ) {
    return this.groupService.updateGroupPicture(sessionId, groupId, dto);
  }

  @Get('invite/:inviteCode/info')
  @ApiOperation({ summary: 'Get group info from invite code' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'inviteCode' })
  getInviteInfo(@Param('sessionId') sessionId: string, @Param('inviteCode') inviteCode: string) {
    return this.groupService.getGroupInviteInfo(sessionId, inviteCode);
  }
}
