import crypto from 'node:crypto';
import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from './hmac';

/**
 * URL-safe signed token: `<base64url(JSON(payload))>.<base64url(HMAC)>`.
 *
 * Unlike the ggwave payment token (payments/payment-token.ts, ~140-byte budget),
 * these ride in URLs that have no practical length limit — so the payload is a
 * full JSON object with `purpose`, `iat`, `exp`, and a `nonce` for replay
 * tracking. Used by verifiable receipts (§2). Gifts use server-authoritative
 * claim codes (see common/ids.ts), NOT this, because Telegram's `?start=`
 * payload is capped at 64 chars.
 *
 * Secret comes from `SIGNED_TOKEN_SECRET` (read by the service layer); these
 * helpers stay pure (secret passed in) so they're trivially unit-testable.
 */

export type SignedPurpose = 'receipt';

export interface SignedPayload {
  purpose: SignedPurpose;
  iat: number; // issued-at, epoch seconds
  exp: number; // expiry, epoch seconds
  nonce: string;
  [key: string]: unknown; // purpose-specific fields (receiptId, amountMinor, …)
}

export interface SignInput {
  purpose: SignedPurpose;
  ttlSec: number;
  /** Epoch seconds "now"; injectable so callers can stay deterministic in tests. */
  now?: number;
  data: Record<string, unknown>;
}

export function sign(input: SignInput, secret: string): string {
  const iat = input.now ?? Math.floor(Date.now() / 1000);
  const payload: SignedPayload = {
    ...input.data,
    purpose: input.purpose,
    iat,
    exp: iat + input.ttlSec,
    nonce: b64urlEncode(crypto.randomBytes(9)), // 12 url-safe chars, ~72 bits
  };
  const bodyB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${bodyB64}.${hmacSign(bodyB64, secret)}`;
}

export type VerifyResult =
  | { ok: true; payload: SignedPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'bad_payload' | 'expired' };

export function verify(token: string, secret: string, now?: number): VerifyResult {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };

  const [bodyB64, sigB64] = parts;
  if (!hmacVerify(bodyB64, sigB64, secret)) return { ok: false, reason: 'bad_signature' };

  let payload: SignedPayload;
  try {
    payload = JSON.parse(b64urlDecode(bodyB64).toString('utf8')) as SignedPayload;
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  if (
    typeof payload.purpose !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.nonce !== 'string'
  ) {
    return { ok: false, reason: 'bad_payload' };
  }

  const ts = now ?? Math.floor(Date.now() / 1000);
  if (ts > payload.exp) return { ok: false, reason: 'expired' };

  return { ok: true, payload };
}
