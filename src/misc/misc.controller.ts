import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MiscService } from './misc.service.js';
import {
  SetPresenceDto,
  SubscribePresenceDto,
  CreateNewsletterDto,
  NewsletterActionDto,
  SendNewsletterMessageDto,
} from './dto/misc.dto.js';

@ApiTags('Misc')
@ApiSecurity('x-api-key')
@Controller(':sessionId')
export class MiscController {
  constructor(private readonly miscService: MiscService) {}

  // === Presence ===
  @Post('presence')
  @ApiOperation({ summary: 'Set presence (composing, recording, available, etc.)' })
  @ApiParam({ name: 'sessionId' })
  setPresence(@Param('sessionId') sessionId: string, @Body() dto: SetPresenceDto) {
    return this.miscService.setPresence(sessionId, dto);
  }

  @Post('presence/subscribe')
  @ApiOperation({ summary: 'Subscribe to presence updates of a contact' })
  @ApiParam({ name: 'sessionId' })
  subscribePresence(@Param('sessionId') sessionId: string, @Body() dto: SubscribePresenceDto) {
    return this.miscService.subscribePresence(sessionId, dto.jid);
  }

  // === Labels ===
  @Get('labels')
  @ApiOperation({ summary: 'Get labels info (delivered via events)' })
  @ApiParam({ name: 'sessionId' })
  getLabels(@Param('sessionId') sessionId: string) {
    return this.miscService.getLabels(sessionId);
  }

  @Post('labels/chat/:jid/:labelId/add')
  @ApiOperation({ summary: 'Add label to a chat' })
  @ApiParam({ name: 'sessionId' })
  addChatLabel(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Param('labelId') labelId: string,
  ) {
    return this.miscService.addChatLabel(sessionId, jid, labelId);
  }

  @Post('labels/chat/:jid/:labelId/remove')
  @ApiOperation({ summary: 'Remove label from a chat' })
  @ApiParam({ name: 'sessionId' })
  removeChatLabel(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Param('labelId') labelId: string,
  ) {
    return this.miscService.removeChatLabel(sessionId, jid, labelId);
  }

  @Post('labels/message/:jid/:messageId/:labelId/add')
  @ApiOperation({ summary: 'Add label to a message' })
  @ApiParam({ name: 'sessionId' })
  addMessageLabel(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Param('messageId') messageId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.miscService.addMessageLabel(sessionId, jid, messageId, labelId);
  }

  @Post('labels/message/:jid/:messageId/:labelId/remove')
  @ApiOperation({ summary: 'Remove label from a message' })
  @ApiParam({ name: 'sessionId' })
  removeMessageLabel(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Param('messageId') messageId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.miscService.removeMessageLabel(sessionId, jid, messageId, labelId);
  }

  // === Privacy ===
  @Get('privacy')
  @ApiOperation({ summary: 'Get all privacy settings' })
  @ApiParam({ name: 'sessionId' })
  getPrivacy(@Param('sessionId') sessionId: string) {
    return this.miscService.getPrivacySettings(sessionId);
  }

  @Post('privacy/last-seen')
  @ApiOperation({ summary: 'Update last-seen privacy' })
  @ApiParam({ name: 'sessionId' })
  updateLastSeen(@Param('sessionId') sessionId: string, @Body() body: { value: string }) {
    return this.miscService.updateLastSeenPrivacy(sessionId, body.value);
  }

  @Post('privacy/online')
  @ApiOperation({ summary: 'Update online status privacy' })
  @ApiParam({ name: 'sessionId' })
  updateOnline(@Param('sessionId') sessionId: string, @Body() body: { value: string }) {
    return this.miscService.updateOnlinePrivacy(sessionId, body.value);
  }

  @Post('privacy/profile-picture')
  @ApiOperation({ summary: 'Update profile picture privacy' })
  @ApiParam({ name: 'sessionId' })
  updateProfilePicture(@Param('sessionId') sessionId: string, @Body() body: { value: string }) {
    return this.miscService.updateProfilePicturePrivacy(sessionId, body.value);
  }

  @Post('privacy/status')
  @ApiOperation({ summary: 'Update status/about privacy' })
  @ApiParam({ name: 'sessionId' })
  updateStatus(@Param('sessionId') sessionId: string, @Body() body: { value: string }) {
    return this.miscService.updateStatusPrivacy(sessionId, body.value);
  }

  @Post('privacy/read-receipts')
  @ApiOperation({ summary: 'Update read receipts privacy' })
  @ApiParam({ name: 'sessionId' })
  updateReadReceipts(@Param('sessionId') sessionId: string, @Body() body: { value: string }) {
    return this.miscService.updateReadReceiptsPrivacy(sessionId, body.value);
  }

  @Post('privacy/groups')
  @ApiOperation({ summary: 'Update groups add privacy' })
  @ApiParam({ name: 'sessionId' })
  updateGroups(@Param('sessionId') sessionId: string, @Body() body: { value: string }) {
    return this.miscService.updateGroupsAddPrivacy(sessionId, body.value);
  }

  // === Newsletter / Channel ===
  @Post('newsletters')
  @ApiOperation({ summary: 'Create a new newsletter/channel' })
  @ApiParam({ name: 'sessionId' })
  createNewsletter(@Param('sessionId') sessionId: string, @Body() dto: CreateNewsletterDto) {
    return this.miscService.createNewsletter(sessionId, dto);
  }

  @Get('newsletters/:newsletterJid')
  @ApiOperation({ summary: 'Get newsletter metadata' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'newsletterJid' })
  getNewsletterInfo(
    @Param('sessionId') sessionId: string,
    @Param('newsletterJid') newsletterJid: string,
  ) {
    return this.miscService.getNewsletterInfo(sessionId, newsletterJid);
  }

  @Get('newsletters/:newsletterJid/subscribers')
  @ApiOperation({ summary: 'Get newsletter subscriber count' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'newsletterJid' })
  getSubscribers(
    @Param('sessionId') sessionId: string,
    @Param('newsletterJid') newsletterJid: string,
  ) {
    return this.miscService.getNewsletterSubscribers(sessionId, newsletterJid);
  }

  @Get('newsletters/:newsletterJid/messages')
  @ApiOperation({ summary: 'Fetch newsletter messages' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'newsletterJid' })
  @ApiQuery({ name: 'count', required: false })
  @ApiQuery({ name: 'since', required: false })
  @ApiQuery({ name: 'after', required: false })
  fetchNewsletterMessages(
    @Param('sessionId') sessionId: string,
    @Param('newsletterJid') newsletterJid: string,
    @Query('count') count?: string,
    @Query('since') since?: string,
    @Query('after') after?: string,
  ) {
    return this.miscService.newsletterFetchMessages(
      sessionId,
      newsletterJid,
      parseInt(count || '10'),
      parseInt(since || '0'),
      parseInt(after || '0'),
    );
  }

  @Post('newsletters/follow')
  @ApiOperation({ summary: 'Follow a newsletter/channel' })
  @ApiParam({ name: 'sessionId' })
  followNewsletter(@Param('sessionId') sessionId: string, @Body() dto: NewsletterActionDto) {
    return this.miscService.followNewsletter(sessionId, dto.newsletterJid);
  }

  @Post('newsletters/unfollow')
  @ApiOperation({ summary: 'Unfollow a newsletter/channel' })
  @ApiParam({ name: 'sessionId' })
  unfollowNewsletter(@Param('sessionId') sessionId: string, @Body() dto: NewsletterActionDto) {
    return this.miscService.unfollowNewsletter(sessionId, dto.newsletterJid);
  }

  @Post('newsletters/mute')
  @ApiOperation({ summary: 'Mute a newsletter/channel' })
  @ApiParam({ name: 'sessionId' })
  muteNewsletter(@Param('sessionId') sessionId: string, @Body() dto: NewsletterActionDto) {
    return this.miscService.muteNewsletter(sessionId, dto.newsletterJid);
  }

  @Post('newsletters/unmute')
  @ApiOperation({ summary: 'Unmute a newsletter/channel' })
  @ApiParam({ name: 'sessionId' })
  unmuteNewsletter(@Param('sessionId') sessionId: string, @Body() dto: NewsletterActionDto) {
    return this.miscService.unmuteNewsletter(sessionId, dto.newsletterJid);
  }

  @Post('newsletters/send')
  @ApiOperation({ summary: 'Send a message to a newsletter' })
  @ApiParam({ name: 'sessionId' })
  sendNewsletterMessage(@Param('sessionId') sessionId: string, @Body() dto: SendNewsletterMessageDto) {
    return this.miscService.sendNewsletterMessage(sessionId, dto);
  }

  @Post('newsletters/:newsletterJid/name')
  @ApiOperation({ summary: 'Update newsletter name' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'newsletterJid' })
  updateNewsletterName(
    @Param('sessionId') sessionId: string,
    @Param('newsletterJid') newsletterJid: string,
    @Body() body: { name: string },
  ) {
    return this.miscService.updateNewsletterName(sessionId, newsletterJid, body.name);
  }

  @Post('newsletters/:newsletterJid/description')
  @ApiOperation({ summary: 'Update newsletter description' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'newsletterJid' })
  updateNewsletterDesc(
    @Param('sessionId') sessionId: string,
    @Param('newsletterJid') newsletterJid: string,
    @Body() body: { description: string },
  ) {
    return this.miscService.updateNewsletterDescription(sessionId, newsletterJid, body.description);
  }

  @Delete('newsletters/:newsletterJid')
  @ApiOperation({ summary: 'Delete a newsletter' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'newsletterJid' })
  deleteNewsletter(
    @Param('sessionId') sessionId: string,
    @Param('newsletterJid') newsletterJid: string,
  ) {
    return this.miscService.deleteNewsletter(sessionId, newsletterJid);
  }

  @Post('newsletters/:newsletterJid/react')
  @ApiOperation({ summary: 'React to a newsletter message' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'newsletterJid' })
  reactNewsletter(
    @Param('sessionId') sessionId: string,
    @Param('newsletterJid') newsletterJid: string,
    @Body() body: { serverId: string; reaction?: string },
  ) {
    return this.miscService.newsletterReactMessage(sessionId, newsletterJid, body.serverId, body.reaction);
  }

  // === Blocklist ===
  @Get('blocklist')
  @ApiOperation({ summary: 'Get blocklist' })
  @ApiParam({ name: 'sessionId' })
  getBlocklist(@Param('sessionId') sessionId: string) {
    return this.miscService.getBlocklist(sessionId);
  }

  // === Device Info ===
  @Get('device')
  @ApiOperation({ summary: 'Get connected device information' })
  @ApiParam({ name: 'sessionId' })
  getDevice(@Param('sessionId') sessionId: string) {
    return this.miscService.getDeviceInfo(sessionId);
  }
}
