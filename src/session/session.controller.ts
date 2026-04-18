import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SessionService } from './session.service.js';
import { CreateSessionDto } from './dto/session.dto.js';

@ApiTags('Session')
@ApiSecurity('x-api-key')
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new WhatsApp session' })
  async create(@Body() dto: CreateSessionDto) {
    return this.sessionService.createSession(dto.sessionId, {
      webhookUrl: dto.webhookUrl,
      pairingCode: dto.pairingCode,
      phoneNumber: dto.phoneNumber,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all sessions (from database)' })
  async getAll() {
    return this.sessionService.getAllSessions();
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get session status' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  async getStatus(@Param('sessionId') sessionId: string) {
    return this.sessionService.getStatus(sessionId);
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a session and remove all data' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  async delete(@Param('sessionId') sessionId: string) {
    return this.sessionService.deleteSession(sessionId);
  }

  @Post(':sessionId/logout')
  @ApiOperation({ summary: 'Logout from WhatsApp and delete session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  async logout(@Param('sessionId') sessionId: string) {
    return this.sessionService.logoutSession(sessionId);
  }

  @Post(':sessionId/reconnect')
  @ApiOperation({ summary: 'Force reconnect a session from stored auth state' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  async reconnect(@Param('sessionId') sessionId: string) {
    // If already connected in memory, delete it first
    if (this.sessionService.isSessionExists(sessionId)) {
      const session = this.sessionService.getSessionData(sessionId);
      try {
        session.socket.end(undefined);
      } catch {
        // Ignore
      }
    }
    // Remove from memory map via reflection
    (this.sessionService as any).sessions?.delete(sessionId);
    return this.sessionService.createSession(sessionId);
  }

  // === Data Access Endpoints ===

  @Get(':sessionId/messages/:jid')
  @ApiOperation({ summary: 'Get message history for a chat (from database)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'jid', description: 'Chat JID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of messages (default: 25)' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Cursor for pagination' })
  async getMessages(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.sessionService.getMessages(sessionId, jid, limit || 25, cursor);
  }

  @Get(':sessionId/contacts')
  @ApiOperation({ summary: 'Get stored contacts (from database)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or JID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset (default: 0)' })
  async getContacts(
    @Param('sessionId') sessionId: string,
    @Query('search') search?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.sessionService.getContacts(sessionId, search, limit || 50, offset || 0);
  }

  @Get(':sessionId/chats')
  @ApiOperation({ summary: 'Get stored chats (from database)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset (default: 0)' })
  async getChats(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.sessionService.getChats(sessionId, limit || 50, offset || 0);
  }

  @Get(':sessionId/webhooks/logs')
  @ApiOperation({ summary: 'Get webhook delivery logs (from database)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset (default: 0)' })
  async getWebhookLogs(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.sessionService.getWebhookLogs(sessionId, limit || 50, offset || 0);
  }
}
