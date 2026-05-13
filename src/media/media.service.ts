import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service.js';
import { randomUUID } from 'crypto';
import { InitUploadDto, InitUploadResponseDto, CompleteUploadResponseDto, StreamUploadResponseDto } from './dto/media.dto.js';

interface S3Config {
  enabled: boolean;
  maxFileSize: number;
  bucket: string;
}

interface UploadSession {
  key: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly config: S3Config;
  private readonly uploadSessions = new Map<string, UploadSession>();

  constructor(
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
  ) {
    this.config = this.configService.get<S3Config>('s3')!;
  }

  async initUpload(dto: InitUploadDto): Promise<InitUploadResponseDto> {
    const uploadId = randomUUID();
    const mediaKey = randomUUID();
    const key = `uploads/${mediaKey}/${dto.filename}`;

    this.uploadSessions.set(uploadId, {
      key,
      filename: dto.filename,
      mimeType: dto.mimeType,
      size: dto.size,
      createdAt: new Date(),
    });

    const uploadUrl = await this.s3Service.generatePresignedUploadUrl(
      key,
      dto.mimeType,
    );

    return {
      uploadId,
      uploadUrl,
      mediaKey,
    };
  }

  async completeUpload(uploadId: string): Promise<CompleteUploadResponseDto> {
    const session = this.uploadSessions.get(uploadId);
    if (!session) {
      throw new Error('Upload session not found or expired');
    }

    const mediaId = session.key.split('/')[1];
    const url = await this.s3Service.getObjectUrl(session.key);

    this.uploadSessions.delete(uploadId);

    return {
      mediaId,
      url,
    };
  }

  async streamUpload(
    file: { originalname: string; mimetype: string; size: number; buffer?: Buffer },
    metadata?: string,
  ): Promise<StreamUploadResponseDto> {
    const mediaKey = randomUUID();
    const key = `uploads/${mediaKey}/${file.originalname}`;

    await this.s3Service.generatePresignedUploadUrl(key, file.mimetype);
    await this.s3Service.deleteObject(key);

    const url = await this.s3Service.getObjectUrl(key);

    return {
      mediaId: mediaKey,
      url,
    };
  }
}