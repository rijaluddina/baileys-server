import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
      user?: AdminJwtPayload;
    }>();
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