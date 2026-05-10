import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDetail {
  @ApiPropertyOptional()
  field?: string;

  @ApiPropertyOptional()
  message: string;
}

export class ErrorResponse {
  @ApiProperty()
  success: boolean = false;

  @ApiProperty()
  error: {
    code: string;
    message: string;
    details?: ErrorResponseDetail[];
  };

  @ApiProperty()
  meta: {
    timestamp: string;
    correlationId?: string;
    path?: string;
  };

  static from(
    code: string,
    message: string,
    correlationId?: string,
    path?: string,
  ): ErrorResponse {
    return {
      success: false,
      error: { code, message },
      meta: {
        timestamp: new Date().toISOString(),
        correlationId,
        path,
      },
    };
  }

  static withDetails(
    code: string,
    message: string,
    details: ErrorResponseDetail[],
    correlationId?: string,
    path?: string,
  ): ErrorResponse {
    return {
      success: false,
      error: { code, message, details },
      meta: {
        timestamp: new Date().toISOString(),
        correlationId,
        path,
      },
    };
  }
}
