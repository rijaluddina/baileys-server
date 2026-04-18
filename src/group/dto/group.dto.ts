import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'My Group' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({ example: ['6281234567890@s.whatsapp.net'] })
  @IsArray()
  @IsNotEmpty()
  participants!: string[];
}

export class UpdateGroupSubjectDto {
  @ApiProperty({ example: 'New Group Name' })
  @IsString()
  @IsNotEmpty()
  subject!: string;
}

export class UpdateGroupDescriptionDto {
  @ApiProperty({ example: 'This is the group description' })
  @IsString()
  description!: string;
}

export class GroupParticipantsDto {
  @ApiProperty({ example: ['6281234567890@s.whatsapp.net'] })
  @IsArray()
  @IsNotEmpty()
  participants!: string[];
}

export enum GroupParticipantAction {
  ADD = 'add',
  REMOVE = 'remove',
  PROMOTE = 'promote',
  DEMOTE = 'demote',
}

export class GroupParticipantActionDto {
  @ApiProperty({ example: ['6281234567890@s.whatsapp.net'] })
  @IsArray()
  @IsNotEmpty()
  participants!: string[];

  @ApiProperty({ enum: GroupParticipantAction })
  @IsEnum(GroupParticipantAction)
  action!: GroupParticipantAction;
}

export class UpdateGroupSettingsDto {
  @ApiPropertyOptional({ description: 'Only admins can send messages' })
  @IsOptional()
  announce?: boolean;

  @ApiPropertyOptional({ description: 'Only admins can edit group info' })
  @IsOptional()
  restrict?: boolean;
}

export class JoinGroupDto {
  @ApiProperty({ description: 'Group invite code', example: 'AbCdEfGh' })
  @IsString()
  @IsNotEmpty()
  inviteCode!: string;
}

export class UpdateGroupPictureDto {
  @ApiProperty({ description: 'Image URL or base64' })
  @IsString()
  @IsNotEmpty()
  image!: string;
}
