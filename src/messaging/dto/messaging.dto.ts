import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsArray, IsNumber, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SendTextDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ example: 'Hello from Baileys API!' })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiPropertyOptional({ description: 'Message ID to reply to' })
  @IsOptional()
  @IsString()
  quotedMessageId?: string;
}

export class SendMediaDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ enum: ['image', 'video', 'audio', 'document', 'sticker'] })
  @IsString()
  @IsNotEmpty()
  type!: 'image' | 'video' | 'audio' | 'document' | 'sticker';

  @ApiProperty({ description: 'URL or base64 of the media' })
  @IsString()
  @IsNotEmpty()
  media!: string;

  @ApiPropertyOptional({ description: 'Caption for image/video/document' })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ description: 'Filename for documents' })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ description: 'Mime type' })
  @IsOptional()
  @IsString()
  mimetype?: string;

  @ApiPropertyOptional({ description: 'Send as view once' })
  @IsOptional()
  @IsBoolean()
  viewOnce?: boolean;

  @ApiPropertyOptional({ description: 'Message ID to reply to' })
  @IsOptional()
  @IsString()
  quotedMessageId?: string;
}

export class SendContactDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({
    description: 'Array of contact cards',
    example: [{ fullName: 'John Doe', phoneNumber: '+6281234567890' }],
  })
  @IsArray()
  @IsNotEmpty()
  contacts!: Array<{ fullName: string; phoneNumber: string; organization?: string }>;
}

export class SendLocationDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ example: -6.2088 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 106.8456 })
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ example: 'Jakarta' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Jl. Sudirman No.1' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class PollOptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class SendPollDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ example: 'What is your favorite color?' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: [PollOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PollOptionDto)
  options!: PollOptionDto[];

  @ApiPropertyOptional({ description: 'Max selectable options', default: 1 })
  @IsOptional()
  @IsNumber()
  selectableCount?: number;
}

export class SendButtonsDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  footer?: string;

  @ApiProperty({ description: 'Button objects' })
  @IsArray()
  buttons!: Array<{ buttonId: string; buttonText: { displayText: string }; type: number }>;
}

export class SendListDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  footer?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  buttonText!: string;

  @ApiProperty({ description: 'List sections' })
  @IsArray()
  sections!: Array<{
    title: string;
    rows: Array<{ title: string; rowId: string; description?: string }>;
  }>;
}

export class SendReactionDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ description: 'Message ID to react to' })
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @ApiProperty({ description: 'Emoji reaction (empty string to remove)', example: '👍' })
  @IsString()
  reaction!: string;
}

export class EditMessageDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ description: 'Message ID to edit' })
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @ApiProperty({ description: 'New text content' })
  @IsString()
  @IsNotEmpty()
  text!: string;
}

export class DeleteMessageDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ description: 'Message ID to delete' })
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @ApiPropertyOptional({ description: 'Delete for everyone', default: true })
  @IsOptional()
  @IsBoolean()
  forEveryone?: boolean;
}

export class ForwardMessageDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ description: 'The message object to forward' })
  @IsNotEmpty()
  message!: Record<string, unknown>;
}

export class ReadMessagesDto {
  @ApiProperty({ description: 'Array of message keys to mark as read' })
  @IsArray()
  @IsNotEmpty()
  keys!: Array<{ remoteJid: string; id: string; fromMe?: boolean }>;
}

export class StarMessageDto {
  @ApiProperty({ description: 'Array of message IDs' })
  @IsArray()
  messages!: Array<{ remoteJid: string; id: string; fromMe?: boolean }>;

  @ApiProperty({ description: 'Star or unstar' })
  @IsBoolean()
  star!: boolean;
}

export class SendStatusDto {
  @ApiProperty({ enum: ['text', 'image', 'video'] })
  @IsString()
  @IsNotEmpty()
  type!: 'text' | 'image' | 'video';

  @ApiPropertyOptional({ description: 'Text content for text status' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ description: 'Media URL for image/video status' })
  @IsOptional()
  @IsString()
  media?: string;

  @ApiPropertyOptional({ description: 'Caption for media status' })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ description: 'Background color for text status', example: '#FF0000' })
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional({ description: 'Font for text status (0-5)', default: 0 })
  @IsOptional()
  @IsNumber()
  font?: number;

  @ApiPropertyOptional({ description: 'Target JIDs (empty = all contacts)' })
  @IsOptional()
  @IsArray()
  statusJidList?: string[];
}
