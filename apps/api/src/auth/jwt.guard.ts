import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Errors } from '../common/errors';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { JwtPayload } from './current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw Errors.unauthorized('missing bearer token');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    try {
      const payload = this.jwt.verify<JwtPayload>(token, { algorithms: ['HS256'] });
      req.user = payload;
      return true;
    } catch {
      throw Errors.unauthorized('invalid or expired session token');
    }
  }
}
