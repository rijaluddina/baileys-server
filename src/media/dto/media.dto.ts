import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsMimeType,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class InitUploadDto {
  @ApiProperty({ description: 'Filename' })
  @IsString()
  filename: string;

  @ApiProperty({ description: 'MIME type' })
  @IsMimeType()
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNumber()
  @Min(1)
  size: number;
}

export class CompleteUploadDto {
  @ApiPropertyOptional({ description: 'Optional metadata' })
  @IsOptional()
  @IsString()
  metadata?: string;
}

export class StreamUploadDto {
  @ApiProperty({ description: 'Session ID' })
  @IsString()
  sessionId: string;
}

export class InitUploadResponseDto {
  @ApiProperty({ description: 'Upload ID' })
  uploadId: string;

  @ApiProperty({ description: 'Presigned URL for upload' })
  uploadUrl: string;

  @ApiProperty({ description: 'Media key' })
  mediaKey: string;
}

export class CompleteUploadResponseDto {
  @ApiProperty({ description: 'Media ID' })
  mediaId: string;

  @ApiProperty({ description: 'Media URL' })
  url: string;
}

export class StreamUploadResponseDto {
  @ApiProperty({ description: 'Media ID' })
  mediaId: string;

  @ApiProperty({ description: 'Media URL' })
  url: string;
}
