import crypto from 'node:crypto';
import { verifyInitData } from './init-data';

const BOT_TOKEN = '7777777777:AAAAfake-bot-token-for-testing-only';

function buildInitData(params: Record<string, string>, secretKey?: Buffer): string {
  const sk =
    secretKey ??
    crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const hash = crypto.createHmac('sha256', sk).update(dataCheckString).digest('hex');
  const usp = new URLSearchParams(params);
  usp.set('hash', hash);
  return usp.toString();
}

describe('verifyInitData', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const userJson = JSON.stringify({ id: 12345, first_name: 'Ada', last_name: 'Lovelace' });

  it('accepts a freshly signed initData', () => {
    const initData = buildInitData({ auth_date: String(nowSec), user: userJson });
    const result = verifyInitData(initData, BOT_TOKEN, 3600);
    expect(result).not.toBeNull();
    expect(result!.user.id).toBe(12345);
    expect(result!.user.first_name).toBe('Ada');
  });

  it('rejects when the hash is tampered with', () => {
    const initData = buildInitData({ auth_date: String(nowSec), user: userJson });
    const tampered = initData.replace(/hash=[a-f0-9]+/, 'hash=' + 'f'.repeat(64));
    expect(verifyInitData(tampered, BOT_TOKEN, 3600)).toBeNull();
  });

  it('rejects when a non-hash field is tampered with', () => {
    const initData = buildInitData({ auth_date: String(nowSec), user: userJson });
    // Replace user with a different user — but keep the same hash. Should fail.
    const tampered = initData.replace(
      encodeURIComponent(userJson),
      encodeURIComponent(JSON.stringify({ id: 99999, first_name: 'Eve' })),
    );
    expect(verifyInitData(tampered, BOT_TOKEN, 3600)).toBeNull();
  });

  it('rejects when signed with a different bot token', () => {
    const otherKey = crypto.createHmac('sha256', 'WebAppData').update('not-our-token').digest();
    const initData = buildInitData({ auth_date: String(nowSec), user: userJson }, otherKey);
    expect(verifyInitData(initData, BOT_TOKEN, 3600)).toBeNull();
  });

  it('rejects stale initData past maxAgeSec', () => {
    const stale = nowSec - 7200;
    const initData = buildInitData({ auth_date: String(stale), user: userJson });
    expect(verifyInitData(initData, BOT_TOKEN, 3600)).toBeNull();
  });

  it('rejects when hash is missing', () => {
    const params = new URLSearchParams({ auth_date: String(nowSec), user: userJson });
    expect(verifyInitData(params.toString(), BOT_TOKEN, 3600)).toBeNull();
  });

  it('rejects when user JSON is unparseable', () => {
    const initData = buildInitData({ auth_date: String(nowSec), user: '{not-json' });
    expect(verifyInitData(initData, BOT_TOKEN, 3600)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(verifyInitData('', BOT_TOKEN, 3600)).toBeNull();
    expect(verifyInitData('a=b', '', 3600)).toBeNull();
  });
});
