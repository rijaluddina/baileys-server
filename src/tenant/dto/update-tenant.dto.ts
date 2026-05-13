import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, IsNumber, IsBoolean } from 'class-validator';
import { CreateTenantDto } from './create-tenant.dto.js';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @ApiPropertyOptional({ description: 'Tenant name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Webhook URL' })
  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @ApiPropertyOptional({ description: 'Maximum sessions allowed' })
  @IsOptional()
  @IsNumber()
  maxSessions?: number;

  @ApiPropertyOptional({ description: 'Is tenant active' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}