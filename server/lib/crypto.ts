/**
 * Симметричное шифрование чувствительных секретов (сейчас — секрет TOTP).
 *
 * AES-256-GCM: даёт и конфиденциальность, и целостность (authTag ловит любую
 * подмену шифротекста). Ключ — 32 байта из env.TOTP_ENCRYPTION_KEY (hex).
 * Формат хранения — одна строка `iv:authTag:ciphertext`, всё в hex.
 *
 * Почему шифруем, а не хэшируем: секрет TOTP нужно уметь ВОССТАНОВИТЬ, чтобы
 * проверять коды из приложения-аутентификатора (в отличие от паролей, которые
 * достаточно хэшировать).
 */

import crypto from 'node:crypto';

const IV_BYTES = 12; // рекомендованный размер nonce для GCM
const KEY_BYTES = 32; // AES-256

/** Разобрать hex-ключ из env в Buffer с понятной ошибкой при неверной длине. */
function keyBuffer(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY должен быть 32 байта в hex (64 символа), получено ${key.length} байт.`,
    );
  }
  return key;
}

/** Зашифровать строку. Возвращает `iv:authTag:ciphertext` (hex). */
export function encryptSecret(plain: string, keyHex: string): string {
  const key = keyBuffer(keyHex);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/** Расшифровать строку формата `iv:authTag:ciphertext`. Бросает при подмене. */
export function decryptSecret(enc: string, keyHex: string): string {
  const key = keyBuffer(keyHex);
  const parts = enc.split(':');
  if (parts.length !== 3) {
    throw new Error('Неверный формат зашифрованного секрета.');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}
