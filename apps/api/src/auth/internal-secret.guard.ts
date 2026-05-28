import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';
import type { Request } from 'express';
import { Errors } from '../common/errors';

/**
 * Bot → API guard. Endpoints decorated with `@UseGuards(InternalSecretGuard)`
 * (and `@Public()` so the global JWT guard skips them) require a matching
 * `X-Internal-Secret` header. Compared in constant time.
 *
 * This is the seam the original brief called for: "Bot → API protected by
 * X-Internal-Secret header guard." Used by POST /auth/bot/exchange so the bot
 * can request a session JWT for a user it knows by telegramId.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_API_SECRET');
    if (!expected) {
      throw Errors.unauthorized('INTERNAL_API_SECRET is not configured');
    }
    const req = ctx.switchToHttp().getRequest<Request>();
    const presented = req.header('x-internal-secret') ?? '';
    if (!presented) throw Errors.unauthorized('missing internal secret');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(presented, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw Errors.unauthorized('invalid internal secret');
    }
    return true;
  }
}
