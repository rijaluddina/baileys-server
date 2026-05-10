import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import type { Response } from 'express';

type BaileysError = {
  reason?: { statusCode?: number; message?: string };
  message?: string;
  output?: { statusCode: number };
};

@Catch()
export class BaileysExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BaileysExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = 500;
    let message = 'Internal server error';
    let code = 'BAILEYS_ERROR';

    if (exception instanceof Error) {
      const baileysErr = exception as BaileysError;
      message = baileysErr.message ?? message;

      if (baileysErr.output?.statusCode) {
        statusCode = baileysErr.output.statusCode;
      } else if (baileysErr.reason?.statusCode) {
        statusCode = baileysErr.reason.statusCode;
      }

      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('timed out') || lowerMsg.includes('timeout')) {
        code = 'TIMEOUT';
        statusCode = 504;
      } else if (lowerMsg.includes('connection')) {
        code = 'CONNECTION_ERROR';
        statusCode = 503;
      } else if (lowerMsg.includes('authentication')) {
        code = 'AUTH_ERROR';
        statusCode = 401;
      } else if (
        lowerMsg.includes('rate limit') ||
        lowerMsg.includes('too many')
      ) {
        code = 'RATE_LIMIT';
        statusCode = 429;
      } else if (lowerMsg.includes('invalid')) {
        code = 'INVALID_REQUEST';
        statusCode = 400;
      }
    }

    if (statusCode === 500) {
      const errMsg =
        exception instanceof Error ? String(exception) : String(exception);
      this.logger.error(
        `Unhandled Baileys exception: ${errMsg}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`Baileys error: ${message} (${statusCode})`);
    }

    response.status(statusCode).json({
      success: false,
      error: { code, message },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
