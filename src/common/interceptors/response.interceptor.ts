import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    const response = context.switchToHttp().getResponse<{
      getHeader?: (key: string) => string | undefined;
      raw?: { getHeader?: (key: string) => string | undefined };
    }>();
    // SSE responses must NOT be wrapped — they stream raw MessageEvent objects
    const contentType =
      response.getHeader?.('content-type') ??
      response.raw?.getHeader?.('content-type') ??
      '';
    if (contentType.includes('text/event-stream')) {
      return next.handle() as Observable<T>;
    }
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data as T,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
