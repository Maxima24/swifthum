import { hashToken, signToken, verifyToken } from './payment-token';

const SECRET = 'test-secret-32-bytes-long-enough-to-be-realistic';

describe('payment-token', () => {
  const futureExp = Math.floor(Date.now() / 1000) + 60;

  it('signs and verifies a round-trip token', () => {
    const token = signToken({ i: 'i_abc', a: 50000, e: futureExp }, SECRET);
    expect(token.startsWith('swfh.')).toBe(true);
    expect(token.split('.').length).toBe(3);
    const verified = verifyToken(token, SECRET);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.i).toBe('i_abc');
      expect(verified.payload.a).toBe(50000);
      expect(verified.payload.e).toBe(futureExp);
    }
  });

  it('rejects token signed with a different secret', () => {
    const token = signToken({ i: 'i_abc', a: 50000, e: futureExp }, SECRET);
    const result = verifyToken(token, 'wrong-secret');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects token with tampered body', () => {
    const token = signToken({ i: 'i_abc', a: 50000, e: futureExp }, SECRET);
    const parts = token.split('.');
    // Re-encode body with a different amount but keep the original signature
    const tamperedBody = Buffer.from(
      JSON.stringify({ i: 'i_abc', a: 999_999_999, e: futureExp }),
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const tampered = [parts[0], tamperedBody, parts[2]].join('.');
    const result = verifyToken(tampered, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects expired token', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 1;
    const token = signToken({ i: 'i_abc', a: 50000, e: pastExp }, SECRET);
    const result = verifyToken(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('rejects malformed token (wrong prefix)', () => {
    const token = signToken({ i: 'i_abc', a: 50000, e: futureExp }, SECRET);
    const malformed = 'other.' + token.split('.').slice(1).join('.');
    const result = verifyToken(malformed, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects malformed token (wrong shape)', () => {
    expect(verifyToken('swfh.only-two-parts', SECRET).ok).toBe(false);
    expect(verifyToken('', SECRET).ok).toBe(false);
  });

  it('hashToken is deterministic and changes with input', () => {
    const a = signToken({ i: 'i_abc', a: 50000, e: futureExp }, SECRET);
    const b = signToken({ i: 'i_abc', a: 50001, e: futureExp }, SECRET);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});
