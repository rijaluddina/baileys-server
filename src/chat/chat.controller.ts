import { Controller, Get, Post, Param, Body, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service.js';
import {
  ArchiveChatDto,
  PinChatDto,
  MuteChatDto,
  DeleteChatDto,
  FetchMessagesDto,
  MarkChatReadDto,
} from './dto/chat.dto.js';

@ApiTags('Chat')
@ApiSecurity('x-api-key')
@Controller(':sessionId/chats')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Get all chats (from database)' })
  @ApiParam({ name: 'sessionId' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset (default: 0)' })
  getChats(
    @Param('sessionId') sessionId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.chatService.getChats(sessionId, limit, offset);
  }

  @Post('archive')
  @ApiOperation({ summary: 'Archive or unarchive a chat' })
  @ApiParam({ name: 'sessionId' })
  archive(@Param('sessionId') sessionId: string, @Body() dto: ArchiveChatDto) {
    return this.chatService.archiveChat(sessionId, dto);
  }

  @Post('pin')
  @ApiOperation({ summary: 'Pin or unpin a chat' })
  @ApiParam({ name: 'sessionId' })
  pin(@Param('sessionId') sessionId: string, @Body() dto: PinChatDto) {
    return this.chatService.pinChat(sessionId, dto);
  }

  @Post('mute')
  @ApiOperation({ summary: 'Mute or unmute a chat' })
  @ApiParam({ name: 'sessionId' })
  mute(@Param('sessionId') sessionId: string, @Body() dto: MuteChatDto) {
    return this.chatService.muteChat(sessionId, dto);
  }

  @Post('mark-read')
  @ApiOperation({ summary: 'Mark chat as read or unread' })
  @ApiParam({ name: 'sessionId' })
  markRead(@Param('sessionId') sessionId: string, @Body() dto: MarkChatReadDto) {
    return this.chatService.markChatRead(sessionId, dto);
  }

  @Post('delete')
  @ApiOperation({ summary: 'Delete a chat' })
  @ApiParam({ name: 'sessionId' })
  deleteChat(@Param('sessionId') sessionId: string, @Body() dto: DeleteChatDto) {
    return this.chatService.deleteChat(sessionId, dto);
  }

  @Get(':jid/messages')
  @ApiOperation({ summary: 'Fetch messages from a chat' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'jid', description: 'Chat JID' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'before', required: false })
  fetchMessages(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Query() query: FetchMessagesDto,
  ) {
    return this.chatService.fetchMessages(sessionId, jid, query);
  }
}
