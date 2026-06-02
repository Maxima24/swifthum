import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError, type ErrorCode } from './errors';

interface ErrorBody {
  error: ErrorCode | string;
  message: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof ApiError) {
      const body = exception.getResponse() as ErrorBody;
      return res.status(exception.getStatus()).json(body);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      let body: ErrorBody;
      if (typeof raw === 'string') {
        body = { error: this.codeFromStatus(status), message: raw };
      } else if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        if (typeof r.error === 'string' && typeof r.message === 'string') {
          body = { error: r.error, message: r.message };
        } else if (Array.isArray(r.message)) {
          body = { error: 'validation_error', message: r.message.join('; ') };
        } else if (typeof r.message === 'string') {
          body = { error: this.codeFromStatus(status), message: r.message };
        } else {
          body = { error: this.codeFromStatus(status), message: 'request failed' };
        }
      } else {
        body = { error: this.codeFromStatus(status), message: 'request failed' };
      }
      return res.status(status).json(body);
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'internal_error',
      message: 'internal server error',
    } satisfies ErrorBody);
  }

  private codeFromStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST: return 'validation_error';
      case HttpStatus.UNAUTHORIZED: return 'unauthorized';
      case HttpStatus.NOT_FOUND: return 'not_found';
      case HttpStatus.CONFLICT: return 'already_redeemed';
      case HttpStatus.GONE: return 'expired';
      default: return 'internal_error';
    }
  }
}
