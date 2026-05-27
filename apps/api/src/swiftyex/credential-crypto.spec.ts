import { decryptCredential, encryptCredential } from './credential-crypto';

const SECRET = 'test-enc-secret-value-doesnt-need-to-be-32-here';

describe('credential-crypto', () => {
  it('round-trips a credential', () => {
    const plaintext = 'sk-swiftyex-live-abc123';
    const packed = encryptCredential(plaintext, SECRET);
    expect(packed).not.toContain(plaintext);
    expect(packed.split(':')).toHaveLength(3);
    expect(decryptCredential(packed, SECRET)).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const a = encryptCredential('same-input', SECRET);
    const b = encryptCredential('same-input', SECRET);
    expect(a).not.toBe(b);
    expect(decryptCredential(a, SECRET)).toBe('same-input');
    expect(decryptCredential(b, SECRET)).toBe('same-input');
  });

  it('fails to decrypt with the wrong secret (GCM auth)', () => {
    const packed = encryptCredential('secret-key', SECRET);
    expect(() => decryptCredential(packed, 'a-different-secret')).toThrow();
  });

  it('fails to decrypt tampered ciphertext', () => {
    const packed = encryptCredential('secret-key', SECRET);
    const [iv, tag, ct] = packed.split(':');
    // flip a byte in the ciphertext
    const buf = Buffer.from(ct, 'base64');
    buf[0] = buf[0] ^ 0xff;
    const tampered = [iv, tag, buf.toString('base64')].join(':');
    expect(() => decryptCredential(tampered, SECRET)).toThrow();
  });

  it('throws on malformed packed input', () => {
    expect(() => decryptCredential('not-valid', SECRET)).toThrow('malformed');
  });

  it('throws when the secret is empty', () => {
    expect(() => encryptCredential('x', '')).toThrow();
  });
});
