/**
 * Двухфакторная аутентификация (TOTP) поверх otplib v13 + qrcode.
 *
 * ВАЖНО: otplib v13 — функциональный async-API (generateSecret / generate /
 * verify / generateURI), НЕ старый `authenticator.generateSecret()`. Секрет —
 * base32-строка, совместимая с Google Authenticator и аналогами.
 *
 * Резервные коды — читаемые `XXXX-XXXX`, хранятся в базе как sha256-хэши
 * (высокоэнтропийные, bcrypt не нужен — та же логика, что у токенов почты).
 */

import crypto from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

const ISSUER = 'Chess 2 ASCENT';
// Окно допуска ±1 шаг (30 с) — сглаживает рассинхрон часов и границу периода.
const EPOCH_TOLERANCE_SEC = 30;

/** Новый base32-секрет TOTP. */
export function generateTotpSecret(): string {
  return generateSecret();
}

/** otpauth://-URI для QR-кода (issuer + логин пользователя как метка). */
export function totpKeyUri(secret: string, username: string): string {
  return generateURI({ issuer: ISSUER, label: username, secret });
}

/** Data-URL PNG с QR-кодом (тот же принцип, что у аватаров: data:image/png;...). */
export function totpQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri);
}

/** Проверить 6-значный код против секрета (с окном допуска ±1 шаг). */
export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const cleaned = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const result = await verify({ secret, token: cleaned, epochTolerance: EPOCH_TOLERANCE_SEC });
  return result.valid;
}

/* ---------- Резервные коды ---------- */

export interface BackupCode {
  hash: string;
  used: boolean;
}

/** Нормализация введённого резервного кода к виду `XXXX-XXXX` в верхнем регистре. */
export function normalizeBackupCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 8) return raw.trim().toUpperCase();
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

/** sha256-хэш резервного кода для хранения. */
export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}

/**
 * Сгенерировать читаемые резервные коды `XXXX-XXXX`. Возвращает и сырые коды
 * (показать пользователю один раз), и объекты для хранения `{ hash, used }`.
 * Алфавит без похожих символов (0/O, 1/I) — меньше ошибок при вводе от руки.
 */
export function generateBackupCodes(count = 8): { codes: string[]; stored: BackupCode[] } {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let s = '';
    for (let j = 0; j < 8; j++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
    codes.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  const stored = codes.map((c) => ({ hash: hashBackupCode(c), used: false }));
  return { codes, stored };
}
