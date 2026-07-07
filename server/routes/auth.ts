/**
 * Аутентификация: POST register/login/logout, GET me.
 * Пароли — bcrypt (cost 12), сессия — JWT в httpOnly-cookie,
 * rate limiting на register/login, вся валидация — zod.
 */

import { Router } from 'express';
import type pg from 'pg';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Env } from '../env';
import { validate } from '../middleware/validate';
import {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  type AuthedRequest,
} from '../middleware/auth';

const BCRYPT_COST = 12;

// Фиктивный хэш для сравнения при неизвестном логине: время ответа одинаково,
// существование пользователя не раскрывается. Вычисляется один раз на старте.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'Только латиница, цифры и подчёркивание'),
  email: z.email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(64),
});

const loginSchema = z.object({
  login: z.string().min(1).max(255), // username или email
  password: z.string().min(1).max(128),
});

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarBase64: string | null;
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  avatar_base64: string | null;
  password_hash: string;
}

function toPublic(row: Omit<UserRow, 'password_hash'>): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarBase64: row.avatar_base64,
  };
}

export function authRouter(pool: pg.Pool, env: Env): Router {
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

  router.post('/register', registerLimiter, validate(registerSchema), async (req, res, next) => {
    try {
      const { username, email, password, displayName } = req.body as z.infer<
        typeof registerSchema
      >;

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
      const inserted = await pool.query(
        `INSERT INTO users (username, display_name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, display_name, avatar_base64`,
        [username, displayName, email, hash],
      );
      const user = inserted.rows[0];
      await pool.query('INSERT INTO stats (user_id) VALUES ($1)', [user.id]);

      setAuthCookie(res, signToken(user.id, env.JWT_SECRET), env.isProd);
      res.status(201).json({ user: toPublic(user) });
    } catch (e) {
      next(e);
    }
  });

  router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
    try {
      const { login, password } = req.body as z.infer<typeof loginSchema>;
      const found = await pool.query(
        `SELECT id, username, display_name, avatar_base64, password_hash
         FROM users WHERE username = $1 OR email = $1`,
        [login],
      );
      const row = found.rows[0] as UserRow | undefined;
      // bcrypt.compare выполняется и при неизвестном логине (одинаковое время
      // ответа — не раскрываем, существует ли пользователь).
      const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
      if (!row || !ok) {
        res.status(401).json({ error: 'bad_credentials' });
        return;
      }
      setAuthCookie(res, signToken(row.id, env.JWT_SECRET), env.isProd);
      res.json({ user: toPublic(row) });
    } catch (e) {
      next(e);
    }
  });

  router.post('/logout', (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth(env.JWT_SECRET), async (req: AuthedRequest, res, next) => {
    try {
      const r = await pool.query(
        'SELECT id, username, display_name, avatar_base64 FROM users WHERE id = $1',
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
