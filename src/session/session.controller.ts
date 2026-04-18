import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'List all active sessions' })
  getAll() {
    return this.sessionService.getAllSessions();
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get session status' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  getStatus(@Param('sessionId') sessionId: string) {
    return this.sessionService.getStatus(sessionId);
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a session and remove auth data' })
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
}
