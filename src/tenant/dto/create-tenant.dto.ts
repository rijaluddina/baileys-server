import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, IsNumber, IsBoolean } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ description: 'Tenant name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Webhook URL' })
  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @ApiPropertyOptional({ description: 'Maximum sessions allowed', default: 1 })
  @IsOptional()
  @IsNumber()
  maxSessions?: number;
}

export class CreateTenantResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  apiKey: string;

  @ApiPropertyOptional()
  webhookUrl?: string;

  @ApiProperty()
  maxSessions: number;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}