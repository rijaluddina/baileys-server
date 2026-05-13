import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { ApiKeyStrategy } from './strategies/api-key.strategy.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [
    AuthService,
    ApiKeyStrategy,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService, ApiKeyStrategy],
})
export class AuthModule {}
