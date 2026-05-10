import { registerAs } from '@nestjs/config';

export const s3Config = registerAs('s3', () => ({
  enabled: process.env.S3_ENABLED === 'true',
  endpoint: process.env.S3_ENDPOINT ?? null,
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'baileys-media',
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? null,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? null,
  acl: process.env.S3_ACL ?? 'private',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  expiresIn: parseInt(process.env.S3_EXPIRES_IN ?? '3600', 10),
  maxFileSize: parseInt(process.env.S3_MAX_FILE_SIZE ?? '67108864', 10),
}));
