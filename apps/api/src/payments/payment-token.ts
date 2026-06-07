import crypto from 'node:crypto';
import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from '../common/hmac';

/**
 * Payment token format:
 *
 *   swfh.<base64url(JSON({ i, a, e }))>.<base64url(HMAC_SHA256(body, secret))>
 *
 *   i: intentId
 *   a: amountMinor (number)
 *   e: expEpochSec (number)
 *
 * ggwave's payload budget is ~140 bytes; this comes in around 90-110.
 * The body fields are advisory — the server re-checks everything against the DB
 * (the DB row is the source of truth) — but having them in the token lets us
 * fail fast on tampered tokens without a DB roundtrip.
 */
export const TOKEN_PREFIX = 'swfh';

export interface TokenPayload {
  i: string; // intentId
  a: number; // amountMinor
  e: number; // expiresAt epoch seconds
}

export function signToken(payload: TokenPayload, secret: string): string {
  const bodyJson = JSON.stringify(payload);
  const bodyB64 = b64urlEncode(Buffer.from(bodyJson, 'utf8'));
  const sigB64 = hmacSign(bodyB64, secret);
  return `${TOKEN_PREFIX}.${bodyB64}.${sigB64}`;
}

export interface VerifyOk {
  ok: true;
  payload: TokenPayload;
  tokenHash: string;
}
export interface VerifyErr {
  ok: false;
  reason: 'malformed' | 'bad_signature' | 'bad_payload' | 'expired';
}

export function verifyToken(token: string, secret: string): VerifyOk | VerifyErr {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return { ok: false, reason: 'malformed' };

  const [, bodyB64, sigB64] = parts;
  if (!hmacVerify(bodyB64, sigB64, secret)) return { ok: false, reason: 'bad_signature' };

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(bodyB64).toString('utf8')) as TokenPayload;
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  if (
    typeof payload.i !== 'string' ||
    typeof payload.a !== 'number' ||
    typeof payload.e !== 'number' ||
    payload.a <= 0
  ) {
    return { ok: false, reason: 'bad_payload' };
  }

  if (Date.now() / 1000 > payload.e) return { ok: false, reason: 'expired' };

  return { ok: true, payload, tokenHash: hashToken(token) };
}

/** Deterministic hash used as the unique key on PaymentIntent.tokenHash. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
