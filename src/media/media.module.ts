import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { MediaService } from './media.service.js';
import { MediaController } from './media.controller.js';
import { S3Service } from './s3.service.js';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 64 * 1024 * 1024,
      },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, S3Service],
  exports: [MediaService],
})
export class MediaModule {}