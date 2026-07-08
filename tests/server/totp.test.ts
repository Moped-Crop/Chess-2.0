/**
 * Юнит-тесты TOTP-обёртки: генерируем секрет → код → проверяем; QR/URI;
 * резервные коды и их хэширование.
 */

import { describe, it, expect } from 'vitest';
import { generate } from 'otplib';
import {
  generateTotpSecret,
  totpKeyUri,
  totpQrDataUrl,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
} from '../../server/lib/totp';

describe('totp: secret / verify', () => {
  it('generates a base32 secret and verifies a fresh code', async () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(10);
    const code = await generate({ secret });
    expect(await verifyTotp(secret, code)).toBe(true);
  });

  it('rejects a wrong code and malformed input', async () => {
    const secret = generateTotpSecret();
    expect(await verifyTotp(secret, '000000')).toBe(false);
    expect(await verifyTotp(secret, 'abc')).toBe(false);
    expect(await verifyTotp(secret, '')).toBe(false);
  });

  it('accepts a code with surrounding whitespace', async () => {
    const secret = generateTotpSecret();
    const code = await generate({ secret });
    expect(await verifyTotp(secret, ` ${code} `)).toBe(true);
  });
});

describe('totp: key URI + QR', () => {
  it('builds an otpauth URI with the issuer and produces a PNG data-URL', async () => {
    const secret = generateTotpSecret();
    const uri = totpKeyUri(secret, 'alice');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('Chess%202%20ASCENT');
    const dataUrl = await totpQrDataUrl(uri);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

describe('totp: backup codes', () => {
  it('generates readable XXXX-XXXX codes with matching hashes', () => {
    const { codes, stored } = generateBackupCodes();
    expect(codes).toHaveLength(8);
    for (const c of codes) expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(stored).toHaveLength(8);
    for (let i = 0; i < codes.length; i++) {
      expect(stored[i].used).toBe(false);
      expect(stored[i].hash).toBe(hashBackupCode(codes[i]));
    }
  });

  it('normalizes user input (case, missing dash) to the same hash', () => {
    const { codes } = generateBackupCodes(1);
    const code = codes[0];
    const noDash = code.replace('-', '').toLowerCase();
    expect(normalizeBackupCode(noDash)).toBe(code);
    expect(hashBackupCode(noDash)).toBe(hashBackupCode(code));
  });
});
