/**
 * Настройки аккаунта: смена пароля/логина/почты, 2FA (TOTP), удаление.
 * Монтируется на /api/account.
 *
 * Всем эндпоинтам (кроме публичного confirm-email-change по ссылке из письма)
 * достаточно requireAuth: раз сессия существует, почта уже подтверждена
 * (см. обязательный гейт в auth.ts), поэтому отдельной проверки email_verified
 * здесь нет.
 *
 * token_version увеличивается при смене пароля и удалении — это разлогинивает
 * ранее выданные сессии. При смене пароля текущему устройству сразу
 * переставляется свежая cookie, чтобы не выкидывать инициатора.
 */

import { Router } from 'express';
import type pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Env } from '../env';
import type { Mailer, Lang } from '../lib/mailer';
import { validate } from '../middleware/validate';
import { generateToken, hashToken } from '../lib/tokens';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import {
  generateTotpSecret,
  totpKeyUri,
  totpQrDataUrl,
  verifyTotp,
  generateBackupCodes,
  type BackupCode,
} from '../lib/totp';
import { verifySecondFactor } from '../lib/twofactor';
import {
  signToken,
  setAuthCookie,
  requireAuth,
  type AuthedRequest,
} from '../middleware/auth';

const BCRYPT_COST = 12;
const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа
const DELETE_CODE_TTL_MS = 10 * 60 * 1000; // 10 минут
const MAX_DELETE_ATTEMPTS = 5;

const langField = z.enum(['ru', 'en']).optional();

// `code` — второй фактор (TOTP или резервный код). Требуется, только если у
// пользователя включена 2FA (проверка ниже, в verify2faIfEnabled).
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
  code: z.string().min(1).max(32).optional(),
});
const changeUsernameSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newUsername: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'Только латиница, цифры и подчёркивание'),
  code: z.string().min(1).max(32).optional(),
});
const changeEmailSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newEmail: z.email().max(255),
  lang: langField,
  code: z.string().min(1).max(32).optional(),
});
const confirmEmailChangeSchema = z.object({ token: z.string().min(1).max(128) });
const confirmSchema = z.object({ code: z.string().min(1).max(32) });
const disableSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  code: z.string().min(1).max(32),
});
const deleteSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  totpCode: z.string().min(1).max(32).optional(),
  emailCode: z.string().min(1).max(32).optional(),
  lang: langField,
});

interface AccountRow {
  id: number;
  username: string;
  display_name: string;
  avatar_base64: string | null;
  password_hash: string;
  email: string;
  totp_enabled: boolean;
  totp_secret_enc: string | null;
  pending_totp_secret_enc: string | null;
  totp_backup_codes: BackupCode[] | string;
  token_version: number;
}

interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarBase64: string | null;
  totpEnabled: boolean;
}

function toPublic(row: {
  id: number;
  username: string;
  display_name: string;
  avatar_base64: string | null;
  totp_enabled: boolean;
}): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarBase64: row.avatar_base64,
    totpEnabled: row.totp_enabled,
  };
}

function parseBackupCodes(value: BackupCode[] | string): BackupCode[] {
  if (typeof value === 'string') return JSON.parse(value) as BackupCode[];
  return value;
}

function pickLang(body: { lang?: Lang }): Lang {
  return body.lang ?? 'ru';
}

export function accountRouter(pool: pg.Pool, env: Env, mailer: Mailer): Router {
  const router = Router();
  const auth = requireAuth(pool, env.JWT_SECRET);

  // Чувствительные операции: щадящий лимит на пользователя/IP.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  /** Загрузить строку аккаунта по id или вернуть undefined. */
  async function load(userId: number): Promise<AccountRow | undefined> {
    const r = await pool.query(
      `SELECT id, username, display_name, avatar_base64, password_hash, email,
              totp_enabled, totp_secret_enc, pending_totp_secret_enc,
              totp_backup_codes, token_version
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    return r.rows[0] as AccountRow | undefined;
  }

  /**
   * Проверить второй фактор для чувствительной операции, ЕСЛИ у пользователя
   * включена 2FA. Без 2FA — всегда ok (код не требуется). Резервный код при
   * использовании помечается использованным. Возвращает признак прохождения.
   */
  async function verify2faIfEnabled(row: AccountRow, code: string | undefined): Promise<boolean> {
    if (!row.totp_enabled) return true;
    if (!code || !row.totp_secret_enc) return false;
    const secret = decryptSecret(row.totp_secret_enc, env.TOTP_ENCRYPTION_KEY);
    const backup = parseBackupCodes(row.totp_backup_codes);
    const result = await verifySecondFactor(secret, backup, code);
    if (!result.ok) return false;
    if (result.backupIndex !== null) {
      backup[result.backupIndex].used = true;
      await pool.query('UPDATE users SET totp_backup_codes = $1 WHERE id = $2', [
        JSON.stringify(backup),
        row.id,
      ]);
    }
    return true;
  }

  /* ==================== Раздел 10: смена пароля/логина/почты ==================== */

  router.post('/change-password', auth, limiter, validate(changePasswordSchema), async (req: AuthedRequest, res, next) => {
    try {
      const { currentPassword, newPassword, code } = req.body as z.infer<typeof changePasswordSchema>;
      const row = await load(req.userId!);
      if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
        res.status(401).json({ error: 'wrong_password' });
        return;
      }
      if (!(await verify2faIfEnabled(row, code))) {
        res.status(401).json({ error: 'totp_invalid' });
        return;
      }
      const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
      // token_version += 1 разлогинивает остальные устройства; текущему сразу
      // переставляем cookie с новой версией, чтобы инициатор остался в системе.
      const upd = await pool.query(
        'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING token_version',
        [hash, row.id],
      );
      const newVersion = upd.rows[0].token_version as number;
      setAuthCookie(res, signToken(row.id, newVersion, env.JWT_SECRET), env.isProd);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.post('/change-username', auth, limiter, validate(changeUsernameSchema), async (req: AuthedRequest, res, next) => {
    try {
      const { currentPassword, newUsername, code } = req.body as z.infer<typeof changeUsernameSchema>;
      const row = await load(req.userId!);
      if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
        res.status(401).json({ error: 'wrong_password' });
        return;
      }
      if (!(await verify2faIfEnabled(row, code))) {
        res.status(401).json({ error: 'totp_invalid' });
        return;
      }
      const taken = await pool.query('SELECT 1 FROM users WHERE username = $1 AND id <> $2', [
        newUsername,
        row.id,
      ]);
      if ((taken.rowCount ?? 0) > 0) {
        res.status(409).json({ error: 'username_taken' });
        return;
      }
      await pool.query('UPDATE users SET username = $1 WHERE id = $2', [newUsername, row.id]);
      res.json({ user: toPublic({ ...row, username: newUsername }) });
    } catch (e) {
      next(e);
    }
  });

  router.post('/change-email', auth, limiter, validate(changeEmailSchema), async (req: AuthedRequest, res, next) => {
    try {
      const { currentPassword, newEmail, code } = req.body as z.infer<typeof changeEmailSchema>;
      const row = await load(req.userId!);
      if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
        res.status(401).json({ error: 'wrong_password' });
        return;
      }
      if (!(await verify2faIfEnabled(row, code))) {
        res.status(401).json({ error: 'totp_invalid' });
        return;
      }
      const taken = await pool.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [
        newEmail,
        row.id,
      ]);
      if ((taken.rowCount ?? 0) > 0) {
        res.status(409).json({ error: 'email_taken' });
        return;
      }
      // Не меняем email сразу: пишем в pending + токен, письмо на НОВЫЙ адрес.
      // Старый email продолжает работать для входа, пока новый не подтверждён.
      const rawToken = generateToken();
      const expires = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
      await pool.query(
        'UPDATE users SET pending_email = $1, pending_email_token_hash = $2, pending_email_expires = $3 WHERE id = $4',
        [newEmail, hashToken(rawToken), expires, row.id],
      );
      const link = `${env.APP_URL}/confirm-email-change?token=${rawToken}`;
      await mailer.sendEmailChangeConfirmation(newEmail, pickLang(req.body), link);
      res.json({ ok: true, pendingEmail: newEmail });
    } catch (e) {
      next(e);
    }
  });

  // Публичный — переход по ссылке из письма (пользователь может быть не залогинен
  // в этой вкладке). Находим по токену, а не по сессии.
  router.post('/confirm-email-change', validate(confirmEmailChangeSchema), async (req, res, next) => {
    try {
      const { token } = req.body as z.infer<typeof confirmEmailChangeSchema>;
      const found = await pool.query(
        `SELECT id, pending_email, pending_email_expires FROM users
         WHERE pending_email_token_hash = $1 AND deleted_at IS NULL`,
        [hashToken(token)],
      );
      const row = found.rows[0] as
        | { id: number; pending_email: string | null; pending_email_expires: Date | string | null }
        | undefined;
      if (!row || !row.pending_email) {
        res.status(400).json({ error: 'invalid_token' });
        return;
      }
      if (!row.pending_email_expires || new Date(row.pending_email_expires) < new Date()) {
        res.status(400).json({ error: 'token_expired' });
        return;
      }
      // Кто-то мог занять этот email, пока ссылка ждала.
      const taken = await pool.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [
        row.pending_email,
        row.id,
      ]);
      if ((taken.rowCount ?? 0) > 0) {
        res.status(409).json({ error: 'email_taken' });
        return;
      }
      await pool.query(
        `UPDATE users
         SET email = pending_email,
             pending_email = NULL,
             pending_email_token_hash = NULL,
             pending_email_expires = NULL
         WHERE id = $1`,
        [row.id],
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  /* ==================== Раздел 11: 2FA (TOTP) ==================== */

  router.post('/2fa/setup', auth, limiter, async (req: AuthedRequest, res, next) => {
    try {
      const row = await load(req.userId!);
      if (!row) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const secret = generateTotpSecret();
      const enc = encryptSecret(secret, env.TOTP_ENCRYPTION_KEY);
      await pool.query('UPDATE users SET pending_totp_secret_enc = $1 WHERE id = $2', [enc, row.id]);
      const uri = totpKeyUri(secret, row.username);
      const qrCodeDataUrl = await totpQrDataUrl(uri);
      res.json({ qrCodeDataUrl, manualEntryKey: secret });
    } catch (e) {
      next(e);
    }
  });

  router.post('/2fa/confirm', auth, limiter, validate(confirmSchema), async (req: AuthedRequest, res, next) => {
    try {
      const { code } = req.body as z.infer<typeof confirmSchema>;
      const row = await load(req.userId!);
      if (!row || !row.pending_totp_secret_enc) {
        res.status(400).json({ error: 'no_pending_2fa' });
        return;
      }
      const secret = decryptSecret(row.pending_totp_secret_enc, env.TOTP_ENCRYPTION_KEY);
      if (!(await verifyTotp(secret, code))) {
        res.status(401).json({ error: 'totp_invalid' });
        return;
      }
      // Код верный → секрет переезжает в боевое поле, генерируем резервные коды.
      const { codes, stored } = generateBackupCodes(8);
      await pool.query(
        `UPDATE users
         SET totp_enabled = true,
             totp_secret_enc = pending_totp_secret_enc,
             pending_totp_secret_enc = NULL,
             totp_backup_codes = $1
         WHERE id = $2`,
        [JSON.stringify(stored), row.id],
      );
      // Сырые коды показываются пользователю ЕДИНСТВЕННЫЙ раз.
      res.json({ backupCodes: codes });
    } catch (e) {
      next(e);
    }
  });

  router.post('/2fa/disable', auth, limiter, validate(disableSchema), async (req: AuthedRequest, res, next) => {
    try {
      const { currentPassword, code } = req.body as z.infer<typeof disableSchema>;
      const row = await load(req.userId!);
      if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
        res.status(401).json({ error: 'wrong_password' });
        return;
      }
      if (!row.totp_enabled || !row.totp_secret_enc) {
        res.status(400).json({ error: 'twofa_not_enabled' });
        return;
      }
      const secret = decryptSecret(row.totp_secret_enc, env.TOTP_ENCRYPTION_KEY);
      const backup = parseBackupCodes(row.totp_backup_codes);
      const result = await verifySecondFactor(secret, backup, code);
      if (!result.ok) {
        res.status(401).json({ error: 'totp_invalid' });
        return;
      }
      await pool.query(
        `UPDATE users
         SET totp_enabled = false,
             totp_secret_enc = NULL,
             pending_totp_secret_enc = NULL,
             totp_backup_codes = '[]'
         WHERE id = $1`,
        [row.id],
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  /* ==================== Раздел 12: удаление аккаунта ==================== */

  router.post('/delete', auth, limiter, validate(deleteSchema), async (req: AuthedRequest, res, next) => {
    try {
      const { currentPassword, totpCode, emailCode } = req.body as z.infer<typeof deleteSchema>;
      const row = await load(req.userId!);
      if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
        res.status(401).json({ error: 'wrong_password' });
        return;
      }

      const secondFactorProvided = totpCode !== undefined || emailCode !== undefined;

      // Первый вызов (без кодов): решаем, каким способом подтверждать.
      if (!secondFactorProvided) {
        if (row.totp_enabled) {
          res.json({ status: 'totp_required' });
          return;
        }
        const code = String(crypto.randomInt(100000, 1000000)); // 6 цифр
        const expires = new Date(Date.now() + DELETE_CODE_TTL_MS);
        await pool.query(
          'UPDATE users SET account_delete_code_hash = $1, account_delete_expires = $2, account_delete_attempts = 0 WHERE id = $3',
          [hashToken(code), expires, row.id],
        );
        await mailer.sendAccountDeleteCode(row.email, pickLang(req.body), code);
        res.json({ status: 'email_code_sent' });
        return;
      }

      // Второй вызов: проверяем соответствующий код.
      let ok = false;
      if (row.totp_enabled) {
        if (totpCode !== undefined) {
          const secret = row.totp_secret_enc
            ? decryptSecret(row.totp_secret_enc, env.TOTP_ENCRYPTION_KEY)
            : null;
          const backup = parseBackupCodes(row.totp_backup_codes);
          ok = (await verifySecondFactor(secret, backup, totpCode)).ok;
        }
      } else if (emailCode !== undefined) {
        const r = await pool.query(
          'SELECT account_delete_code_hash, account_delete_expires, account_delete_attempts FROM users WHERE id = $1',
          [row.id],
        );
        const d = r.rows[0] as {
          account_delete_code_hash: string | null;
          account_delete_expires: Date | string | null;
          account_delete_attempts: number;
        };
        if (d.account_delete_attempts >= MAX_DELETE_ATTEMPTS) {
          // Слишком много попыток — код сгорает, нужно запрашивать заново.
          await pool.query(
            'UPDATE users SET account_delete_code_hash = NULL, account_delete_expires = NULL WHERE id = $1',
            [row.id],
          );
          res.status(429).json({ error: 'too_many_attempts' });
          return;
        }
        const valid =
          d.account_delete_code_hash === hashToken(emailCode) &&
          d.account_delete_expires !== null &&
          new Date(d.account_delete_expires) >= new Date();
        if (!valid) {
          await pool.query(
            'UPDATE users SET account_delete_attempts = account_delete_attempts + 1 WHERE id = $1',
            [row.id],
          );
        }
        ok = valid;
      }

      if (!ok) {
        res.status(401).json({ error: 'code_invalid' });
        return;
      }

      // Анонимизация вместо DELETE (games.white_id/black_id ссылаются на
      // users(id) без ON DELETE CASCADE — историю партий других игроков ломать
      // нельзя). Оригинальный email освобождается (placeholder уникален).
      await pool.query(
        `UPDATE users SET
           username = 'deleted_user_' || id::text,
           display_name = 'Удалённый пользователь',
           email = 'deleted+' || id::text || '@deleted.invalid',
           password_hash = 'deleted',
           avatar_base64 = NULL,
           totp_enabled = false,
           totp_secret_enc = NULL,
           pending_totp_secret_enc = NULL,
           totp_backup_codes = '[]',
           email_verify_token_hash = NULL,
           email_verify_expires = NULL,
           pending_email = NULL,
           pending_email_token_hash = NULL,
           pending_email_expires = NULL,
           password_reset_token_hash = NULL,
           password_reset_expires = NULL,
           account_delete_code_hash = NULL,
           account_delete_expires = NULL,
           deleted_at = NOW(),
           token_version = token_version + 1
         WHERE id = $1`,
        [row.id],
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
