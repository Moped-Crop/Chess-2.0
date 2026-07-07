/**
 * Аутентификация: JWT в httpOnly-cookie.
 *  - signToken/setAuthCookie — выдача токена при регистрации/входе;
 *  - requireAuth — middleware защищённых маршрутов (кладёт userId в req).
 *
 * Токен недоступен из JS (httpOnly) — защита от кражи через XSS; отсюда же
 * необходимость CSRF-защиты (см. csrf.ts).
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const TOKEN_COOKIE = 'token';
const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 дней

export interface AuthedRequest extends Request {
  userId?: number;
}

export function signToken(userId: number, secret: string): string {
  return jwt.sign({ uid: userId }, secret, { expiresIn: TOKEN_TTL_SEC });
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

/** Достать и проверить userId из cookie. null — не авторизован/истёк. */
export function verifyTokenCookie(
  cookies: Record<string, string | undefined>,
  secret: string,
): number | null {
  const token = cookies[TOKEN_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret) as { uid?: unknown };
    return typeof payload.uid === 'number' ? payload.uid : null;
  } catch {
    return null;
  }
}

export function requireAuth(secret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const uid = verifyTokenCookie(req.cookies ?? {}, secret);
    if (uid === null) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.userId = uid;
    next();
  };
}
