import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin:
      process.env['CORS_ORIGIN'] ||
      (process.env['NODE_ENV'] === 'production' ? false : true),
  },
  namespace: '/ws',
})
export class SessionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(SessionGateway.name);

  constructor(private readonly configService: ConfigService) {}

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const apiKey = this.configService.get<string>('API_KEY');
    if (apiKey) {
      const provided =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers['x-api-key'] as string);
      if (!provided || provided !== apiKey) {
        client.emit('error', { message: 'Unauthorized' });
        client.disconnect(true);
        return;
      }
    }

    const sessionId = client.handshake.query['sessionId'] as string;
    if (sessionId) {
      client.join(sessionId);
    }
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @OnEvent('session.qr')
  handleQr(payload: { sessionId: string; qr: string }) {
    this.server.emit('qr', payload);
  }

  @OnEvent('session.pairing-code')
  handlePairingCode(payload: { sessionId: string; pairingCode: string }) {
    this.server.emit('pairing-code', payload);
  }

  @OnEvent('session.connected')
  handleConnected(payload: { sessionId: string; user: unknown }) {
    this.server.emit('connected', payload);
  }

  @OnEvent('session.logged-out')
  handleLoggedOut(payload: { sessionId: string }) {
    this.server.emit('logged-out', payload);
  }

  @OnEvent('baileys.*')
  handleBaileysEvent(payload: { sessionId: string; data: unknown }) {
    // Forward all baileys events via WebSocket
    this.server.emit('baileys-event', payload);
  }
}
