import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum, IsArray, IsNumber } from 'class-validator';

// === Presence ===
export enum PresenceType {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
  COMPOSING = 'composing',
  RECORDING = 'recording',
  PAUSED = 'paused',
}

export class SetPresenceDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;

  @ApiProperty({ enum: PresenceType })
  @IsEnum(PresenceType)
  presence!: PresenceType;
}

export class SubscribePresenceDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;
}

// === Labels ===
export class CreateLabelDto {
  @ApiProperty({ example: 'Important' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: '#FF0000' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class AssignLabelDto {
  @ApiProperty({ description: 'Label ID' })
  @IsString()
  @IsNotEmpty()
  labelId!: string;

  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;

  @ApiProperty({ description: 'Assign (true) or remove (false) label' })
  assign!: boolean;
}

// === Privacy ===
export enum PrivacyValue {
  ALL = 'all',
  CONTACTS = 'contacts',
  CONTACT_BLACKLIST = 'contact_blacklist',
  NONE = 'none',
  MATCH_LAST_SEEN = 'match_last_seen',
}

export class UpdatePrivacyDto {
  @ApiProperty({ enum: ['last-seen', 'online', 'profile-picture', 'about', 'groups', 'read-receipts'] })
  @IsString()
  @IsNotEmpty()
  setting!: string;

  @ApiProperty({ enum: PrivacyValue })
  @IsEnum(PrivacyValue)
  value!: PrivacyValue;
}

// === Newsletter ===
export class CreateNewsletterDto {
  @ApiProperty({ example: 'My Newsletter' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Newsletter description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class NewsletterActionDto {
  @ApiProperty({ description: 'Newsletter JID' })
  @IsString()
  @IsNotEmpty()
  newsletterJid!: string;
}

export class SendNewsletterMessageDto {
  @ApiProperty({ description: 'Newsletter JID' })
  @IsString()
  @IsNotEmpty()
  newsletterJid!: string;

  @ApiProperty({ description: 'Text content' })
  @IsString()
  @IsNotEmpty()
  text!: string;
}
