import { sign, verify } from './signed-token';

const SECRET = 'test-signed-token-secret';
const NOW = 1_750_000_000; // fixed epoch seconds for determinism

describe('signed-token', () => {
  it('round-trips a valid token', () => {
    const token = sign(
      { purpose: 'receipt', ttlSec: 3600, now: NOW, data: { receiptId: 'rcpt_1', amountMinor: 5000 } },
      SECRET,
    );
    const res = verify(token, SECRET, NOW + 10);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.purpose).toBe('receipt');
      expect(res.payload.receiptId).toBe('rcpt_1');
      expect(res.payload.amountMinor).toBe(5000);
      expect(typeof res.payload.nonce).toBe('string');
    }
  });

  it('fails verification when the body is tampered (the URL-tamper demo)', () => {
    const token = sign(
      { purpose: 'receipt', ttlSec: 3600, now: NOW, data: { amountMinor: 5000 } },
      SECRET,
    );
    const [body, sig] = token.split('.');
    // Flip a character in the payload — signature must no longer match.
    const tamperedBody = body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A');
    const res = verify(`${tamperedBody}.${sig}`, SECRET, NOW + 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('bad_signature');
  });

  it('rejects a token signed with a different secret', () => {
    const token = sign({ purpose: 'receipt', ttlSec: 3600, now: NOW, data: {} }, SECRET);
    expect(verify(token, 'other-secret', NOW + 10).ok).toBe(false);
  });

  it('rejects an expired token', () => {
    const token = sign({ purpose: 'receipt', ttlSec: 60, now: NOW, data: {} }, SECRET);
    const res = verify(token, SECRET, NOW + 61);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('expired');
  });

  it('rejects a malformed token', () => {
    expect(verify('not-a-token', SECRET, NOW).ok).toBe(false);
    expect(verify('only.two.parts', SECRET, NOW).ok).toBe(false);
  });
});
