import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
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

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;
    const configuredKey = this.configService.get<string>('API_KEY');

    if (!configuredKey) return true; // No key configured = open access
    if (!apiKey) throw new UnauthorizedException('API key is required');
    if (apiKey !== configuredKey) throw new UnauthorizedException('Invalid API key');

    return true;
  }
}
