/**
 * Проверка «второго фактора» при входе, отключении 2FA и удалении аккаунта:
 * код из приложения-аутентификатора (TOTP) ИЛИ одноразовый резервный код.
 *
 * Функция чистая: принимает уже расшифрованный секрет и массив резервных кодов,
 * возвращает результат. Пометку резервного кода `used` и запись в базу делает
 * вызывающий код (у него транзакция и доступ к пулу).
 */

import { verifyTotp, hashBackupCode, type BackupCode } from './totp';

export interface SecondFactorResult {
  ok: boolean;
  /** Индекс использованного резервного кода (если сработал он), иначе null. */
  backupIndex: number | null;
}

/**
 * Проверить код против TOTP-секрета и списка резервных кодов.
 * Резервный код срабатывает только если он ещё не использован (`used: false`).
 */
export async function verifySecondFactor(
  secret: string | null,
  backupCodes: BackupCode[],
  code: string,
): Promise<SecondFactorResult> {
  if (secret && (await verifyTotp(secret, code))) {
    return { ok: true, backupIndex: null };
  }
  const hash = hashBackupCode(code);
  const idx = backupCodes.findIndex((b) => !b.used && b.hash === hash);
  if (idx !== -1) return { ok: true, backupIndex: idx };
  return { ok: false, backupIndex: null };
}
