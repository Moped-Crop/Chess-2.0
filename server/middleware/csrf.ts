/**
 * CSRF-защита по схеме Double Submit Cookie.
 *
 * Авторизация живёт в httpOnly-cookie, поэтому браузер прикладывает её к любым
 * запросам, включая подделанные с чужих сайтов. Защита: клиент читает токен из
 * ОБЫЧНОЙ cookie (доступной JS) и дублирует его в заголовке X-CSRF-Token.
 * Чужой сайт не может прочитать нашу cookie → не может подделать заголовок.
 *
 * Все изменяющие методы (POST/PUT/PATCH/DELETE) обязаны пройти проверку.
 */

import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const CSRF_COOKIE = 'csrf';
const CSRF_HEADER = 'x-csrf-token';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Выдать (или переиспользовать) CSRF-токен. GET /api/csrf. */
export function issueCsrfToken(req: Request, res: Response, isProd: boolean): void {
  let token = (req.cookies ?? {})[CSRF_COOKIE] as string | undefined;
  if (!token || typeof token !== 'string' || token.length !== 64) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // клиент обязан уметь его прочитать — в этом суть схемы
      sameSite: 'lax',
      secure: isProd,
      path: '/',
    });
  }
  res.json({ csrfToken: token });
}

/** Middleware: сверка заголовка с cookie на всех изменяющих запросах. */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }
  const cookie = (req.cookies ?? {})[CSRF_COOKIE] as string | undefined;
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || cookie !== header) {
    res.status(403).json({ error: 'csrf' });
    return;
  }
  next();
}
