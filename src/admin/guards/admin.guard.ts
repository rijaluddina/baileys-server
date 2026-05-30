import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';

export interface AdminJwtPayload {
  sub: string;
  email?: string;
  role: string;
  tenantId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string; 'x-master-key'?: string };
      user?: AdminJwtPayload;
    }>();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const masterKey = request.headers?.['x-master-key'];
    const configuredMasterKey = this.configService.get<string>('MASTER_API_KEY');

    if (masterKey && configuredMasterKey) {
      const masterKeyBuffer = Buffer.from(masterKey);
      const configuredKeyBuffer = Buffer.from(configuredMasterKey);
      const isMatch =
        masterKeyBuffer.length === configuredKeyBuffer.length &&
        crypto.timingSafeEqual(masterKeyBuffer, configuredKeyBuffer);
      if (isMatch) {
        return true;
      }
    }

    const authHeader = request.headers?.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const token = authHeader.slice(7);
    const payload = this.verifyToken(token);

    if (payload.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    request.user = payload;
    return true;
  }

  private verifyToken(token: string): AdminJwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8');
      const decoded = JSON.parse(payloadStr) as AdminJwtPayload;

      if (decoded.exp && decoded.exp < Date.now() / 1000) {
        throw new UnauthorizedException('Token expired');
      }

      return decoded;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid token');
    }
  }
}