import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService, ValidatedTenant } from '../auth.service.js';

@Injectable()
export class ApiKeyStrategy {
  constructor(private readonly authService: AuthService) {}

  async validate(apiKey: string): Promise<ValidatedTenant> {
    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    return this.authService.validateApiKey(apiKey);
  }
}
