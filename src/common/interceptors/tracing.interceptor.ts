import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TracingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ method?: string; url?: string; correlationId?: string }>();
    const { method, url, correlationId } = request;

    this.logger.debug(`[${correlationId}] ${method} ${url} started`);

    return next.handle();
  }
}
