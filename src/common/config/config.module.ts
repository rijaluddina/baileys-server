import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './app.config.js';
import { databaseConfig } from './database.config.js';
import { redisConfig } from './redis.config.js';
import { s3Config } from './s3.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, s3Config],
    }),
  ],
})
export class AppConfigModule {}
