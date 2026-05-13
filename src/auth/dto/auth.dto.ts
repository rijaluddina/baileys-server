import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateApiKeyDto {
  @ApiProperty({ description: 'API key from X-API-Key header' })
  @IsString()
  apiKey: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  tenantId: string;

  @ApiPropertyOptional({ description: 'Tenant name' })
  @IsOptional()
  @IsString()
  tenantName?: string;

  @ApiProperty({ description: 'Whether the key is valid' })
  valid: boolean;
}
