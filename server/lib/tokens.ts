/**
 * Одноразовые токены/коды для писем (подтверждение почты, сброс пароля, смена
 * почты, удаление аккаунта).
 *
 * В базе хранится ТОЛЬКО sha256-хэш — так же, как CSRF-токен в csrf.ts. Это
 * случайные строки высокой энтропии, поэтому sha256 уместен, а bcrypt (для
 * низкоэнтропийных паролей) тут не нужен.
 */

import crypto from 'node:crypto';

/** Случайный высокоэнтропийный токен (как CSRF): 32 байта в hex. */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** sha256-хэш токена/кода для хранения и сравнения. */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
