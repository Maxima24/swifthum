import crypto from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface VerifiedInitData {
  user: TelegramUser;
  authDateEpochSec: number;
}

/**
 * Verifies a Telegram WebApp `initData` string against the bot token.
 * Returns the parsed user + auth_date when valid, or `null` when invalid.
 *
 * Per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *   1. parse pairs from initData (URLSearchParams)
 *   2. remove `hash`
 *   3. sort remaining keys alphabetically
 *   4. join `${key}=${value}` lines with '\n'
 *   5. secretKey = HMAC_SHA256("WebAppData", botToken)
 *   6. computedHash = HMAC_SHA256(secretKey, dataCheckString)  (hex)
 *   7. constant-time compare to provided hash
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec: number,
): VerifiedInitData | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDateStr = params.get('auth_date');
  const authDate = authDateStr ? Number(authDateStr) : NaN;
  if (!Number.isFinite(authDate)) return null;
  if (Date.now() / 1000 - authDate > maxAgeSec) return null;

  const userJson = params.get('user');
  if (!userJson) return null;
  let user: TelegramUser;
  try {
    user = JSON.parse(userJson) as TelegramUser;
  } catch {
    return null;
  }
  if (typeof user.id !== 'number' || typeof user.first_name !== 'string') return null;

  return { user, authDateEpochSec: authDate };
}
