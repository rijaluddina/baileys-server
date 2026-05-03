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
  Sse,
  MessageEvent,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiSecurity,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent, merge } from 'rxjs';
import { filter, map, takeUntil } from 'rxjs/operators';
import { SessionService } from './session.service.js';
import { CreateSessionDto } from './dto/session.dto.js';

@ApiTags('Session')
@ApiSecurity('x-api-key')
@Controller('sessions')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Sse(':sessionId/qr/stream')
  @ApiOperation({ summary: 'Stream QR code events via SSE' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  qrStream(@Param('sessionId') sessionId: string): Observable<MessageEvent> {
    const qrEvent$ = fromEvent(this.eventEmitter, 'session.qr').pipe(
      filter((payload: any) => payload.sessionId === sessionId),
      map((payload: any) => ({
        data: { qr: payload.qr },
        type: 'qr',
      }) as MessageEvent),
    );

    const connected$ = fromEvent(this.eventEmitter, 'session.connected').pipe(
      filter((payload: any) => payload.sessionId === sessionId),
    );

    const loggedOut$ = fromEvent(this.eventEmitter, 'session.logged-out').pipe(
      filter((payload: any) => payload.sessionId === sessionId),
    );

    const close$ = merge(connected$, loggedOut$);

    return qrEvent$.pipe(takeUntil(close$));
  }

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
    return this.sessionService.reconnectSession(sessionId);
  }

  // === Data Access Endpoints ===

  @Get(':sessionId/messages/:jid')
  @ApiOperation({ summary: 'Get message history for a chat (from database)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'jid', description: 'Chat JID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of messages (default: 25)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor for pagination',
  })
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
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by name or JID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Limit (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Offset (default: 0)',
  })
  async getContacts(
    @Param('sessionId') sessionId: string,
    @Query('search') search?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.sessionService.getContacts(
      sessionId,
      search,
      limit || 50,
      offset || 0,
    );
  }

  @Get(':sessionId/chats')
  @ApiOperation({ summary: 'Get stored chats (from database)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Limit (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Offset (default: 0)',
  })
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
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Limit (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Offset (default: 0)',
  })
  async getWebhookLogs(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.sessionService.getWebhookLogs(
      sessionId,
      limit || 50,
      offset || 0,
    );
  }
}
