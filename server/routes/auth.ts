/**
 * Аутентификация: register/login/logout, GET me, подтверждение почты,
 * восстановление пароля, второй фактор при входе (2FA).
 *
 * Обязательный гейт почты: register НЕ создаёт сессию, login блокируется, пока
 * email_verified = false. Отсюда инвариант «любая живая сессия ⇒ почта
 * подтверждена» — отдельных проверок email_verified на других роутах не нужно.
 *
 * Пароли — bcrypt (cost 12); сессия — JWT в httpOnly-cookie с token_version;
 * одноразовые токены писем — sha256-хэш в базе (см. lib/tokens.ts);
 * вся валидация — zod; rate limiting на всех чувствительных роутах.
 */

import { Router } from 'express';
import type pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import type { Env } from '../env';
import type { Mailer, Lang } from '../lib/mailer';
import { validate } from '../middleware/validate';
import { generateToken, hashToken } from '../lib/tokens';
import { decryptSecret } from '../lib/crypto';
import { verifySecondFactor } from '../lib/twofactor';
import type { BackupCode } from '../lib/totp';
import {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  type AuthedRequest,
} from '../middleware/auth';

const BCRYPT_COST = 12;

// Сроки жизни токенов.
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа
const RESET_TTL_MS = 60 * 60 * 1000; // 1 час
const RESEND_COOLDOWN_MS = 60 * 1000; // не чаще раза в минуту одному адресату
const LOGIN2FA_TTL = '5m'; // короткоживущий challenge между паролем и 2FA

// Фиктивный хэш для сравнения при неизвестном логине: время ответа одинаково,
// существование пользователя не раскрывается. Вычисляется один раз на старте.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

const langField = z.enum(['ru', 'en']).optional();

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'Только латиница, цифры и подчёркивание'),
  email: z.email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(64),
  lang: langField,
});

const loginSchema = z.object({
  login: z.string().min(1).max(255), // username или email
  password: z.string().min(1).max(128),
});

const verifyEmailSchema = z.object({ token: z.string().min(1).max(128) });
const resendSchema = z.object({ email: z.email().max(255), lang: langField });
const forgotSchema = z.object({ email: z.email().max(255), lang: langField });
const resetSchema = z.object({
  token: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
const verify2faSchema = z.object({
  challenge: z.string().min(1).max(1024),
  code: z.string().min(1).max(32),
});

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarBase64: string | null;
  totpEnabled: boolean;
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  avatar_base64: string | null;
  password_hash: string;
  email: string;
  email_verified: boolean;
  totp_enabled: boolean;
  totp_secret_enc: string | null;
  totp_backup_codes: BackupCode[] | string;
  token_version: number;
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

function pickLang(body: { lang?: Lang }): Lang {
  return body.lang ?? 'ru';
}

/** JSONB: настоящий pg отдаёт массивом, pg-mem — строкой. Нормализуем. */
function parseBackupCodes(value: BackupCode[] | string): BackupCode[] {
  if (typeof value === 'string') return JSON.parse(value) as BackupCode[];
  return value;
}

export function authRouter(pool: pg.Pool, env: Env, mailer: Mailer): Router {
  const router = Router();

  const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  // Публичный resend: 10 запросов в час на IP (второй слой поверх cooldown-а
  // на сам адрес). forgot-password — как login.
  const resendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  // Проверка 2FA при входе — строго: 8 попыток за 15 минут на пару IP+challenge.
  const verify2faLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const challenge = typeof req.body?.challenge === 'string' ? req.body.challenge : '';
      return `${ipKeyGenerator(req.ip ?? '')}:${hashToken(challenge).slice(0, 16)}`;
    },
  });

  /* ---------- Регистрация: создаёт аккаунт, но НЕ сессию ---------- */

  router.post('/register', registerLimiter, validate(registerSchema), async (req, res, next) => {
    try {
      const { username, email, password, displayName } = req.body as z.infer<typeof registerSchema>;

      // Опечатка в почте не должна навсегда занимать никнейм: аккаунт, чья
      // почта так и не подтверждена, никогда не был «использован» (без сессии
      // в него нельзя войти — ни партий, ни друзей, только нулевая строка
      // stats на каскадном удалении). Такую строку честно удаляем и даём
      // зарегистрироваться заново — сразу, без ожидания истечения токена.
      // deleted_at IS NULL — страховка: анонимизированные аккаунты не трогаем
      // (на них могут ссылаться сыгранные партии).
      await pool.query(
        `DELETE FROM users
         WHERE (username = $1 OR email = $2) AND email_verified = false AND deleted_at IS NULL`,
        [username, email],
      );

      const taken = await pool.query(
        'SELECT username, email FROM users WHERE username = $1 OR email = $2',
        [username, email],
      );
      if ((taken.rowCount ?? 0) > 0) {
        const sameName = taken.rows.some((r) => r.username === username);
        res.status(409).json({ error: sameName ? 'username_taken' : 'email_taken' });
        return;
      }

      const hash = await bcrypt.hash(password, BCRYPT_COST);
      const rawToken = generateToken();
      const expires = new Date(Date.now() + VERIFY_TTL_MS);
      const inserted = await pool.query(
        `INSERT INTO users
           (username, display_name, email, password_hash,
            email_verified, email_verify_token_hash, email_verify_expires, email_verify_last_sent_at)
         VALUES ($1, $2, $3, $4, false, $5, $6, NOW())
         RETURNING id`,
        [username, displayName, email, hash, hashToken(rawToken), expires],
      );
      const userId = inserted.rows[0].id as number;
      await pool.query('INSERT INTO stats (user_id) VALUES ($1)', [userId]);

      // Письмо не должно ронять регистрацию: аккаунт уже создан, письмо
      // переотправляется кнопкой «проверьте почту».
      const link = `${env.APP_URL}/verify-email?token=${rawToken}`;
      await mailer.sendVerificationEmail(email, pickLang(req.body), link);

      res.status(201).json({ status: 'verify_email_sent', email });
    } catch (e) {
      next(e);
    }
  });

  /* ---------- Вход: гейт почты + возможный второй фактор ---------- */

  router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
    try {
      const { login, password } = req.body as z.infer<typeof loginSchema>;
      const found = await pool.query(
        `SELECT id, username, display_name, avatar_base64, password_hash, email,
                email_verified, totp_enabled, token_version
         FROM users WHERE (username = $1 OR email = $1) AND deleted_at IS NULL`,
        [login],
      );
      const row = found.rows[0] as UserRow | undefined;
      // bcrypt.compare выполняется и при неизвестном логине (одинаковое время).
      const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
      if (!row || !ok) {
        res.status(401).json({ error: 'bad_credentials' });
        return;
      }

      // Гейт: без подтверждённой почты сессию не выдаём.
      if (!row.email_verified) {
        res.status(403).json({ error: 'email_not_verified', email: row.email });
        return;
      }

      // Второй фактор: если включён — вместо cookie отдаём короткий challenge.
      if (row.totp_enabled) {
        const challenge = jwt.sign({ uid: row.id, purpose: 'login2fa' }, env.JWT_SECRET, {
          expiresIn: LOGIN2FA_TTL,
        });
        res.json({ requires2fa: true, challenge });
        return;
      }

      setAuthCookie(res, signToken(row.id, row.token_version, env.JWT_SECRET), env.isProd);
      res.json({ user: toPublic(row) });
    } catch (e) {
      next(e);
    }
  });

  /* ---------- Второй фактор при входе ---------- */

  router.post(
    '/login/verify-2fa',
    verify2faLimiter,
    validate(verify2faSchema),
    async (req, res, next) => {
      try {
        const { challenge, code } = req.body as z.infer<typeof verify2faSchema>;
        let uid: number;
        try {
          const payload = jwt.verify(challenge, env.JWT_SECRET) as {
            uid?: unknown;
            purpose?: unknown;
          };
          // Явная проверка purpose: challenge не должен подходить как обычная сессия.
          if (payload.purpose !== 'login2fa' || typeof payload.uid !== 'number') {
            res.status(401).json({ error: 'invalid_token' });
            return;
          }
          uid = payload.uid;
        } catch {
          res.status(401).json({ error: 'token_expired' });
          return;
        }

        const found = await pool.query(
          `SELECT id, username, display_name, avatar_base64, totp_enabled,
                  totp_secret_enc, totp_backup_codes, token_version
           FROM users WHERE id = $1 AND deleted_at IS NULL`,
          [uid],
        );
        const row = found.rows[0] as UserRow | undefined;
        if (!row || !row.totp_enabled || !row.totp_secret_enc) {
          res.status(401).json({ error: 'invalid_token' });
          return;
        }

        const secret = decryptSecret(row.totp_secret_enc, env.TOTP_ENCRYPTION_KEY);
        const backup = parseBackupCodes(row.totp_backup_codes);
        const result = await verifySecondFactor(secret, backup, code);
        if (!result.ok) {
          res.status(401).json({ error: 'totp_invalid' });
          return;
        }
        // Резервный код одноразовый — помечаем использованным.
        if (result.backupIndex !== null) {
          backup[result.backupIndex].used = true;
          await pool.query('UPDATE users SET totp_backup_codes = $1 WHERE id = $2', [
            JSON.stringify(backup),
            row.id,
          ]);
        }

        setAuthCookie(res, signToken(row.id, row.token_version, env.JWT_SECRET), env.isProd);
        res.json({ user: toPublic(row) });
      } catch (e) {
        next(e);
      }
    },
  );

  /* ---------- Подтверждение почты ---------- */

  router.post('/verify-email', validate(verifyEmailSchema), async (req, res, next) => {
    try {
      const { token } = req.body as z.infer<typeof verifyEmailSchema>;
      const found = await pool.query(
        `SELECT id, username, display_name, avatar_base64, totp_enabled,
                email_verify_expires, token_version
         FROM users WHERE email_verify_token_hash = $1 AND deleted_at IS NULL`,
        [hashToken(token)],
      );
      const row = found.rows[0] as
        | (UserRow & { email_verify_expires: Date | string | null })
        | undefined;
      if (!row) {
        res.status(400).json({ error: 'invalid_token' });
        return;
      }
      if (!row.email_verify_expires || new Date(row.email_verify_expires) < new Date()) {
        res.status(400).json({ error: 'token_expired' });
        return;
      }

      await pool.query(
        `UPDATE users
         SET email_verified = true,
             email_verify_token_hash = NULL,
             email_verify_expires = NULL
         WHERE id = $1`,
        [row.id],
      );

      // Мгновенный вход по клику из письма — без повторного логина.
      setAuthCookie(res, signToken(row.id, row.token_version, env.JWT_SECRET), env.isProd);
      res.json({ user: toPublic(row) });
    } catch (e) {
      next(e);
    }
  });

  /* ---------- Повторная отправка письма подтверждения (без авторизации) ---------- */

  router.post('/resend-verification', resendLimiter, validate(resendSchema), async (req, res, next) => {
    try {
      const { email } = req.body as z.infer<typeof resendSchema>;
      // Отвечаем ВСЕГДА одинаково — не раскрываем существование аккаунта.
      const found = await pool.query(
        `SELECT id, email_verified, email_verify_last_sent_at
         FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [email],
      );
      const row = found.rows[0] as
        | { id: number; email_verified: boolean; email_verify_last_sent_at: Date | string | null }
        | undefined;

      if (row && !row.email_verified) {
        const last = row.email_verify_last_sent_at
          ? new Date(row.email_verify_last_sent_at).getTime()
          : 0;
        if (Date.now() - last >= RESEND_COOLDOWN_MS) {
          const rawToken = generateToken();
          const expires = new Date(Date.now() + VERIFY_TTL_MS);
          await pool.query(
            `UPDATE users
             SET email_verify_token_hash = $1, email_verify_expires = $2, email_verify_last_sent_at = NOW()
             WHERE id = $3`,
            [hashToken(rawToken), expires, row.id],
          );
          const link = `${env.APP_URL}/verify-email?token=${rawToken}`;
          await mailer.sendVerificationEmail(email, pickLang(req.body), link);
        }
      }

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  /* ---------- Восстановление пароля ---------- */

  router.post('/forgot-password', forgotLimiter, validate(forgotSchema), async (req, res, next) => {
    try {
      const { email } = req.body as z.infer<typeof forgotSchema>;
      const found = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email],
      );
      const row = found.rows[0] as { id: number } | undefined;
      if (row) {
        const rawToken = generateToken();
        const expires = new Date(Date.now() + RESET_TTL_MS);
        await pool.query(
          'UPDATE users SET password_reset_token_hash = $1, password_reset_expires = $2 WHERE id = $3',
          [hashToken(rawToken), expires, row.id],
        );
        const link = `${env.APP_URL}/reset-password?token=${rawToken}`;
        await mailer.sendPasswordResetEmail(email, pickLang(req.body), link);
      }
      // Всегда одинаковый ответ — не раскрываем существование аккаунта.
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.post('/reset-password', forgotLimiter, validate(resetSchema), async (req, res, next) => {
    try {
      const { token, newPassword } = req.body as z.infer<typeof resetSchema>;
      const found = await pool.query(
        `SELECT id, password_reset_expires FROM users
         WHERE password_reset_token_hash = $1 AND deleted_at IS NULL`,
        [hashToken(token)],
      );
      const row = found.rows[0] as
        | { id: number; password_reset_expires: Date | string | null }
        | undefined;
      if (!row) {
        res.status(400).json({ error: 'invalid_token' });
        return;
      }
      if (!row.password_reset_expires || new Date(row.password_reset_expires) < new Date()) {
        res.status(400).json({ error: 'token_expired' });
        return;
      }

      const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
      await pool.query(
        `UPDATE users
         SET password_hash = $1,
             password_reset_token_hash = NULL,
             password_reset_expires = NULL,
             email_verified = true,
             token_version = token_version + 1
         WHERE id = $2`,
        [hash, row.id],
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  /* ---------- Сессия ---------- */

  router.post('/logout', (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth(pool, env.JWT_SECRET), async (req: AuthedRequest, res, next) => {
    try {
      const r = await pool.query(
        'SELECT id, username, display_name, avatar_base64, totp_enabled FROM users WHERE id = $1',
        [req.userId],
      );
      if ((r.rowCount ?? 0) === 0) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      res.json({ user: toPublic(r.rows[0]) });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
