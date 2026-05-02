import { Controller, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MessagingService } from './messaging.service.js';
import {
  SendTextDto,
  SendMediaDto,
  SendContactDto,
  SendLocationDto,
  SendPollDto,
  SendButtonsDto,
  SendListDto,
  SendReactionDto,
  EditMessageDto,
  DeleteMessageDto,
  ForwardMessageDto,
  ReadMessagesDto,
  StarMessageDto,
  SendStatusDto,
} from './dto/messaging.dto.js';

@ApiTags('Messaging')
@ApiSecurity('x-api-key')
@Throttle({ default: { ttl: 60000, limit: 30 } })
@Controller(':sessionId/messages')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('text')
  @ApiOperation({ summary: 'Send a text message' })
  @ApiParam({ name: 'sessionId' })
  sendText(@Param('sessionId') sessionId: string, @Body() dto: SendTextDto) {
    return this.messagingService.sendText(sessionId, dto);
  }

  @Post('media')
  @ApiOperation({ summary: 'Send media (image, video, audio, document, sticker)' })
  @ApiParam({ name: 'sessionId' })
  sendMedia(@Param('sessionId') sessionId: string, @Body() dto: SendMediaDto) {
    return this.messagingService.sendMedia(sessionId, dto);
  }

  @Post('contact')
  @ApiOperation({ summary: 'Send contact card (vCard)' })
  @ApiParam({ name: 'sessionId' })
  sendContact(@Param('sessionId') sessionId: string, @Body() dto: SendContactDto) {
    return this.messagingService.sendContact(sessionId, dto);
  }

  @Post('location')
  @ApiOperation({ summary: 'Send location' })
  @ApiParam({ name: 'sessionId' })
  sendLocation(@Param('sessionId') sessionId: string, @Body() dto: SendLocationDto) {
    return this.messagingService.sendLocation(sessionId, dto);
  }

  @Post('poll')
  @ApiOperation({ summary: 'Send a poll' })
  @ApiParam({ name: 'sessionId' })
  sendPoll(@Param('sessionId') sessionId: string, @Body() dto: SendPollDto) {
    return this.messagingService.sendPoll(sessionId, dto);
  }

  @Post('buttons')
  @ApiOperation({ summary: 'Send buttons message' })
  @ApiParam({ name: 'sessionId' })
  sendButtons(@Param('sessionId') sessionId: string, @Body() dto: SendButtonsDto) {
    return this.messagingService.sendButtons(sessionId, dto);
  }

  @Post('list')
  @ApiOperation({ summary: 'Send list message' })
  @ApiParam({ name: 'sessionId' })
  sendList(@Param('sessionId') sessionId: string, @Body() dto: SendListDto) {
    return this.messagingService.sendList(sessionId, dto);
  }

  @Post('reaction')
  @ApiOperation({ summary: 'Send reaction emoji to a message' })
  @ApiParam({ name: 'sessionId' })
  sendReaction(@Param('sessionId') sessionId: string, @Body() dto: SendReactionDto) {
    return this.messagingService.sendReaction(sessionId, dto);
  }

  @Post('edit')
  @ApiOperation({ summary: 'Edit a sent message' })
  @ApiParam({ name: 'sessionId' })
  editMessage(@Param('sessionId') sessionId: string, @Body() dto: EditMessageDto) {
    return this.messagingService.editMessage(sessionId, dto);
  }

  @Post('delete')
  @ApiOperation({ summary: 'Delete a message (for everyone or just me)' })
  @ApiParam({ name: 'sessionId' })
  deleteMessage(@Param('sessionId') sessionId: string, @Body() dto: DeleteMessageDto) {
    return this.messagingService.deleteMessage(sessionId, dto);
  }

  @Post('forward')
  @ApiOperation({ summary: 'Forward a message to another chat' })
  @ApiParam({ name: 'sessionId' })
  forwardMessage(@Param('sessionId') sessionId: string, @Body() dto: ForwardMessageDto) {
    return this.messagingService.forwardMessage(sessionId, dto);
  }

  @Post('read')
  @ApiOperation({ summary: 'Mark messages as read' })
  @ApiParam({ name: 'sessionId' })
  readMessages(@Param('sessionId') sessionId: string, @Body() dto: ReadMessagesDto) {
    return this.messagingService.readMessages(sessionId, dto);
  }

  @Post('star')
  @ApiOperation({ summary: 'Star or unstar messages' })
  @ApiParam({ name: 'sessionId' })
  starMessages(@Param('sessionId') sessionId: string, @Body() dto: StarMessageDto) {
    return this.messagingService.starMessages(sessionId, dto);
  }

  @Post('status')
  @ApiOperation({ summary: 'Post a status/story (text, image, or video)' })
  @ApiParam({ name: 'sessionId' })
  sendStatus(@Param('sessionId') sessionId: string, @Body() dto: SendStatusDto) {
    return this.messagingService.sendStatus(sessionId, dto);
  }

  @Post('link-preview')
  @ApiOperation({ summary: 'Send a message with link preview' })
  @ApiParam({ name: 'sessionId' })
  sendLinkPreview(
    @Param('sessionId') sessionId: string,
    @Body() body: { to: string; url: string; text?: string },
  ) {
    return this.messagingService.sendLinkPreview(sessionId, body.to, body.url, body.text);
  }
}
