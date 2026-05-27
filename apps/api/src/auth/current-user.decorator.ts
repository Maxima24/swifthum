import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

export interface JwtPayload {
  sub: string;       // userId (prefixed, e.g. u_xxx)
  telegramId: number;
  iat: number;
  exp: number;
}

declare module 'express' {
  interface Request {
    user?: JwtPayload;
  }
}

export const CurrentUser = createParamDecorator((_data, ctx: ExecutionContext): JwtPayload => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.user) throw new Error('CurrentUser used on an unauthenticated route');
  return req.user;
});
