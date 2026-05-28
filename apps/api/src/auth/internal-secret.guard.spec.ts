import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard';
import { ApiError } from '../common/errors';

function makeCtx(headerValue: string | undefined): ExecutionContext {
  const headers: Record<string, string> = headerValue !== undefined
    ? { 'x-internal-secret': headerValue }
    : {};
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => headers[name.toLowerCase()],
        headers,
      }),
    }),
  } as unknown as ExecutionContext;
}

function makeConfig(secret: string | undefined): ConfigService {
  return { get: (k: string) => (k === 'INTERNAL_API_SECRET' ? secret : undefined) } as ConfigService;
}

describe('InternalSecretGuard', () => {
  const SECRET = 'a-test-internal-secret-32-bytes-or-whatever';

  it('passes when the header matches', () => {
    const guard = new InternalSecretGuard(makeConfig(SECRET));
    expect(guard.canActivate(makeCtx(SECRET))).toBe(true);
  });

  it('rejects with 401 when the header is missing', () => {
    const guard = new InternalSecretGuard(makeConfig(SECRET));
    try {
      guard.canActivate(makeCtx(undefined));
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('unauthorized');
    }
  });

  it('rejects with 401 when the header is wrong', () => {
    const guard = new InternalSecretGuard(makeConfig(SECRET));
    expect(() => guard.canActivate(makeCtx('not-the-secret'))).toThrow(ApiError);
  });

  it('rejects (does not crash) when INTERNAL_API_SECRET is unconfigured', () => {
    const guard = new InternalSecretGuard(makeConfig(undefined));
    expect(() => guard.canActivate(makeCtx(SECRET))).toThrow(ApiError);
  });

  it('rejects when lengths differ (timingSafeEqual would otherwise throw)', () => {
    const guard = new InternalSecretGuard(makeConfig(SECRET));
    expect(() => guard.canActivate(makeCtx('short'))).toThrow(ApiError);
  });
});
