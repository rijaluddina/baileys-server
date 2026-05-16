import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface S3Config {
  enabled: boolean;
  endpoint: string | null;
  region: string;
  bucket: string;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  acl: string;
  forcePathStyle: boolean;
  expiresIn: number;
  maxFileSize: number;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly config: S3Config;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<S3Config>('s3')!;
    this.client = new S3Client({
      endpoint: this.config.endpoint ?? undefined,
      region: this.config.region,
      forcePathStyle: this.config.forcePathStyle,
      credentials: this.config.accessKeyId
        ? {
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey ?? '',
          }
        : undefined,
    });
  }

  async generatePresignedUploadUrl(
    key: string,
    mimeType: string,
    expiresIn: number = this.config.expiresIn,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: mimeType,
      ACL: this.config.acl as ObjectCannedACL,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async getObjectUrl(key: string): Promise<string> {
    if (this.config.endpoint) {
      return `${this.config.endpoint}/${this.config.bucket}/${key}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });
    await this.client.send(command);
  }
}
