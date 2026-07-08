/**
 * Аутентификация: JWT в httpOnly-cookie.
 *  - signToken/setAuthCookie — выдача токена при регистрации/входе;
 *  - requireAuth — middleware защищённых маршрутов (кладёт userId в req).
 *
 * Токен недоступен из JS (httpOnly) — защита от кражи через XSS; отсюда же
 * необходимость CSRF-защиты (см. csrf.ts).
 *
 * token_version: в payload зашит `tv`. При смене пароля/удалении аккаунта
 * счётчик в базе увеличивается — все ранее выданные токены (на всех
 * устройствах) перестают проходить requireAuth. Поэтому requireAuth делает
 * лёгкий SELECT token_version на каждый защищённый запрос — для масштаба
 * проекта это несущественно, а безопасность важнее.
 */

import type { Request, Response, NextFunction } from 'express';
import type pg from 'pg';
import jwt from 'jsonwebtoken';

const TOKEN_COOKIE = 'token';
const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 дней

export interface AuthedRequest extends Request {
  userId?: number;
}

export interface TokenPayload {
  uid: number;
  tv: number;
}

export function signToken(userId: number, tokenVersion: number, secret: string): string {
  return jwt.sign({ uid: userId, tv: tokenVersion }, secret, { expiresIn: TOKEN_TTL_SEC });
}

export function setAuthCookie(res: Response, token: string, isProd: boolean): void {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: TOKEN_TTL_SEC * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
}

/** Достать и проверить payload из cookie. null — не авторизован/истёк. */
export function verifyTokenCookie(
  cookies: Record<string, string | undefined>,
  secret: string,
): TokenPayload | null {
  const token = cookies[TOKEN_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret) as { uid?: unknown; tv?: unknown };
    if (typeof payload.uid !== 'number' || typeof payload.tv !== 'number') return null;
    return { uid: payload.uid, tv: payload.tv };
  } catch {
    return null;
  }
}

/**
 * Middleware защищённых маршрутов: проверяет подпись/срок JWT и сверяет `tv` с
 * текущим token_version пользователя в базе (иначе разлогиненная смена пароля
 * не сработала бы). Не совпало/пользователь удалён → 401.
 */
export function requireAuth(pool: pg.Pool, secret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const payload = verifyTokenCookie(req.cookies ?? {}, secret);
    if (payload === null) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    pool
      .query('SELECT token_version FROM users WHERE id = $1 AND deleted_at IS NULL', [payload.uid])
      .then((r) => {
        const row = r.rows[0] as { token_version: number } | undefined;
        if (!row || row.token_version !== payload.tv) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        req.userId = payload.uid;
        next();
      })
      .catch(next);
  };
}
