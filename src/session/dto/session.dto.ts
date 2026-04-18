import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsUrl, Matches } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ description: 'Unique session ID', example: 'my-session' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'Session ID must be alphanumeric with dashes/underscores' })
  sessionId!: string;

  @ApiPropertyOptional({ description: 'Webhook URL for this session' })
  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @ApiPropertyOptional({ description: 'Use pairing code instead of QR', default: false })
  @IsOptional()
  pairingCode?: boolean;

  @ApiPropertyOptional({ description: 'Phone number for pairing code (with country code)', example: '6281234567890' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

export class SessionStatusDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ enum: ['connecting', 'open', 'close'] })
  status!: string;

  @ApiPropertyOptional()
  qr?: string;

  @ApiPropertyOptional()
  pairingCode?: string;

  @ApiPropertyOptional()
  user?: Record<string, unknown>;
}
