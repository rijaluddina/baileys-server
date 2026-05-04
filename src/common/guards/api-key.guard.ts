import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const apiKey = request.headers['x-api-key'] as string | undefined;
    const configuredKey = this.configService.get<string>('API_KEY');

    if (!configuredKey) return true; // No key configured = open access
    if (!apiKey) throw new UnauthorizedException('API key is required');

    // Constant-time comparison to prevent timing attacks
    const apiKeyBuffer = Buffer.from(apiKey);
    const configuredKeyBuffer = Buffer.from(configuredKey);
    const isMatch =
      apiKeyBuffer.length === configuredKeyBuffer.length &&
      crypto.timingSafeEqual(apiKeyBuffer, configuredKeyBuffer);
    if (!isMatch) throw new UnauthorizedException('Invalid API key');

    return true;
  }
}
