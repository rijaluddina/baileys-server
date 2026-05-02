import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsArray } from 'class-validator';

export class CheckNumberDto {
  @ApiProperty({ example: ['6281234567890'] })
  @IsArray()
  @IsNotEmpty()
  numbers!: string[];
}

export class ProfilePictureDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;

  @ApiPropertyOptional({ description: 'Get high-res image', default: false })
  @IsOptional()
  highRes?: boolean;
}

export class BlockContactDto {
  @ApiProperty({ example: '6281234567890@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;
}

export class UpdateProfilePictureDto {
  @ApiProperty({ description: 'Image URL or base64' })
  @IsString()
  @IsNotEmpty()
  image!: string;
}

export class UpdateProfileNameDto {
  @ApiProperty({ example: 'My Name' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateProfileStatusDto {
  @ApiProperty({ example: 'Available' })
  @IsString()
  @IsNotEmpty()
  status!: string;
}

export class UpdateBusinessProfileDto {
  @ApiPropertyOptional({ example: '123 Main St' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: ['https://example.com'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  websites?: string[];

  @ApiPropertyOptional({ example: 'contact@example.com' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'We are a great business' })
  @IsString()
  @IsOptional()
  description?: string;
}
