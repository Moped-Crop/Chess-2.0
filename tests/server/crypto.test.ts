/**
 * Юнит-тесты AES-256-GCM helpers: шифруем → расшифровываем, ловим подмену.
 */

import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../../server/lib/crypto';

const KEY = '0'.repeat(64); // 32 байта в hex
const KEY2 = 'f'.repeat(64);

describe('crypto: encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const plain = 'JBSWY3DPEHPK3PXP-totp-secret';
    const enc = encryptSecret(plain, KEY);
    expect(enc).not.toContain(plain);
    expect(enc.split(':')).toHaveLength(3);
    expect(decryptSecret(enc, KEY)).toBe(plain);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same', KEY);
    const b = encryptSecret('same', KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe('same');
    expect(decryptSecret(b, KEY)).toBe('same');
  });

  it('fails to decrypt with the wrong key', () => {
    const enc = encryptSecret('secret', KEY);
    expect(() => decryptSecret(enc, KEY2)).toThrow();
  });

  it('fails to decrypt tampered ciphertext (authTag catches it)', () => {
    const enc = encryptSecret('secret', KEY);
    const parts = enc.split(':');
    // Портим последний байт шифротекста.
    const data = parts[2];
    const flipped = data.slice(0, -1) + (data[data.length - 1] === '0' ? '1' : '0');
    expect(() => decryptSecret(`${parts[0]}:${parts[1]}:${flipped}`, KEY)).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() => encryptSecret('x', 'abcd')).toThrow();
  });
});
