import crypto from 'node:crypto';

/**
 * AES-256-GCM envelope for SwiftyEx API credentials at rest. The 32-byte key is
 * derived from SWIFTYEX_KEY_ENC_SECRET via SHA-256 so any length secret works.
 * Packed format: base64(iv):base64(authTag):base64(ciphertext).
 *
 * Sandbox keys are fake, but we encrypt them anyway so the live path is byte-for-byte
 * identical — no special-casing when real keys arrive.
 */
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function deriveKey(secret: string): Buffer {
  if (!secret) throw new Error('SWIFTYEX_KEY_ENC_SECRET is not set');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptCredential(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptCredential(packed: string, secret: string): string {
  const parts = packed.split(':');
  if (parts.length !== 3) throw new Error('malformed credential ciphertext');
  const [ivB64, tagB64, ctB64] = parts;
  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
