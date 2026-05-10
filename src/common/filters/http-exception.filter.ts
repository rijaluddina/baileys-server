import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // Baileys throws these during normal connection lifecycle; suppress them.
  private static readonly IGNORED_MESSAGES = new Set([
    'Connection Closed',
    'Connection Terminated',
    'Connection Lost',
    'Timed Out',
  ]);

  catch(exception: unknown, host: ArgumentsHost) {
    // Non-HTTP contexts (WebSocket, background tasks) — just log and return
    if (host.getType() !== 'http') {
      if (exception instanceof Error) {
        if (!AllExceptionsFilter.IGNORED_MESSAGES.has(exception.message)) {
          this.logger.error(
            `Unhandled error: ${exception.message}`,
            exception.stack,
          );
        }
      }
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (((res as Record<string, unknown>).message as string) ??
            exception.message);
    } else if (exception instanceof Error) {
      message = exception.message;
      if (!AllExceptionsFilter.IGNORED_MESSAGES.has(exception.message)) {
        this.logger.error(
          `Unhandled error: ${exception.message}`,
          exception.stack,
        );
      }
    }

    response.status(status).send({
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
