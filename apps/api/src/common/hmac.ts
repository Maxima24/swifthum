import crypto from 'node:crypto';

/**
 * Shared HMAC-SHA256 + base64url primitives.
 *
 * Extracted from payments/payment-token.ts so the ggwave token, URL-signed
 * receipt tokens (common/signed-token.ts), and any future signer reuse the exact
 * same byte-lean crypto core. No behaviour change from the original token code.
 */

export const b64urlEncode = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const b64urlDecode = (s: string): Buffer => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
};

/** HMAC-SHA256 of `data` (utf8 or already-encoded string), returned base64url. */
export function hmacSign(data: string, secret: string): string {
  return b64urlEncode(crypto.createHmac('sha256', secret).update(data).digest());
}

/**
 * Constant-time verification of a base64url HMAC over `data`. Returns false on
 * any malformed signature rather than throwing.
 */
export function hmacVerify(data: string, sigB64: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(data).digest();
  let actual: Buffer;
  try {
    actual = b64urlDecode(sigB64);
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
