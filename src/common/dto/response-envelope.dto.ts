import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResponseEnvelopeMeta {
  @ApiProperty()
  timestamp: string;

  @ApiPropertyOptional()
  correlationId?: string;

  @ApiPropertyOptional()
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ResponseEnvelope<T> {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  data: T;

  @ApiProperty({ type: ResponseEnvelopeMeta })
  meta: ResponseEnvelopeMeta;

  static ok<T>(data: T, correlationId?: string): ResponseEnvelope<T> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        correlationId,
      },
    };
  }

  static paginated<T>(
    data: T[],
    meta: ResponseEnvelopeMeta['pagination'],
    correlationId?: string,
  ): ResponseEnvelope<T[]> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        correlationId,
        pagination: meta,
      },
    };
  }
}
