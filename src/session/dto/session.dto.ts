import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  IsBoolean,
} from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ description: 'Human-readable session label (unique within tenant)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ description: 'Custom session ID (auto-generated UUID if omitted)', example: 'my-session' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Session ID must be alphanumeric with dashes/underscores',
  })
  @MinLength(3)
  @MaxLength(64)
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Webhook URL for this session' })
  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @ApiPropertyOptional({
    description: 'Use pairing code instead of QR',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  pairingCode?: boolean;

  @ApiPropertyOptional({
    description: 'Phone number for pairing code (with country code)',
    example: '6281234567890',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

export class SessionResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['created', 'initializing', 'qr_ready', 'pairing', 'authenticated', 'connected', 'reconnecting', 'disconnected', 'destroyed'] })
  status!: string;

  @ApiPropertyOptional()
  qrCode?: string;

  @ApiPropertyOptional()
  pairingCode?: string;

  @ApiPropertyOptional()
  phoneNumber?: string;

  @ApiPropertyOptional()
  userName?: string;

  @ApiPropertyOptional()
  lastActiveAt?: string;

  @ApiPropertyOptional()
  createdAt?: string;

  @ApiPropertyOptional()
  updatedAt?: string;
}
