import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class ArchiveChatDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;

  @ApiProperty({ description: 'Archive (true) or unarchive (false)' })
  @IsBoolean()
  archive!: boolean;
}

export class PinChatDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;

  @ApiProperty({ description: 'Pin (true) or unpin (false)' })
  @IsBoolean()
  pin!: boolean;
}

export class MuteChatDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;

  @ApiPropertyOptional({ description: 'Mute duration in ms (null = forever, 0 = unmute)' })
  @IsOptional()
  @IsNumber()
  duration?: number;
}

export class DeleteChatDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;
}

export class FetchMessagesDto {
  @ApiPropertyOptional({ description: 'Number of messages to fetch', default: 25 })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ description: 'Cursor message ID for pagination' })
  @IsOptional()
  @IsString()
  before?: string;
}

export class MarkChatReadDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;

  @ApiProperty({ description: 'Mark as read (true) or unread (false)' })
  @IsBoolean()
  read!: boolean;
}
