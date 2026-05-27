import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Machine error codes the frontend keys on. **Do not rename** — the Mini App
 * at apps/mini-app/ matches these exact strings.
 */
export type ErrorCode =
  | 'validation_error'
  | 'invalid_init_data'
  | 'unauthorized'
  | 'not_found'
  | 'insufficient_balance'
  | 'invalid_or_expired'
  | 'already_redeemed'
  | 'expired'
  | 'rule_limit_reached'
  | 'internal_error';

export class ApiError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
  ) {
    super({ error: code, message }, status);
  }
}

export const Errors = {
  validation: (msg: string) => new ApiError('validation_error', msg, HttpStatus.BAD_REQUEST),
  invalidInitData: (msg = 'invalid initData') =>
    new ApiError('invalid_init_data', msg, HttpStatus.UNAUTHORIZED),
  unauthorized: (msg = 'unauthorized') =>
    new ApiError('unauthorized', msg, HttpStatus.UNAUTHORIZED),
  notFound: (msg = 'not found') => new ApiError('not_found', msg, HttpStatus.NOT_FOUND),
  insufficientBalance: (msg = 'insufficient balance') =>
    new ApiError('insufficient_balance', msg, HttpStatus.BAD_REQUEST),
  invalidOrExpired: (msg = 'invalid or expired token') =>
    new ApiError('invalid_or_expired', msg, HttpStatus.UNAUTHORIZED),
  alreadyRedeemed: (msg = 'already redeemed') =>
    new ApiError('already_redeemed', msg, HttpStatus.CONFLICT),
  expired: (msg = 'expired') => new ApiError('expired', msg, HttpStatus.GONE),
  ruleLimitReached: (msg = 'rule limit reached') =>
    new ApiError('rule_limit_reached', msg, HttpStatus.BAD_REQUEST),
};
