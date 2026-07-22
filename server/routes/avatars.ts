/**
 * Отдача аватарок бинарём по userId.
 *
 * Раньше `avatar_base64` (data-URL до ~280К символов) вкладывался в КАЖДУЮ
 * строку списочных ответов (лидерборд, друзья, беседы, история…) — ответ
 * раздувался до мегабайтов (25 строк лидерборда ≈ до 6.7 МБ). Теперь списки
 * несут только userId, а картинка тянется этой ручкой: летит бинарём (на треть
 * меньше base64), кешируется браузером на сутки, ревалидируется по ETag.
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import type pg from 'pg';
import type { Env } from '../env';
import { requireAuth, type AuthedRequest } from '../middleware/auth';

/** Разбирает `data:image/png;base64,XXXX` → { mime, buffer }. */
function parseDataUrl(dataUrl: string): { mime: string; buf: Buffer } | null {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  try {
    const buf = Buffer.from(m[2], 'base64');
    return buf.length > 0 ? { mime: m[1].toLowerCase(), buf } : null;
  } catch {
    return null;
  }
}

export function avatarsRouter(pool: pg.Pool, env: Env): Router {
  const router = Router();
  const auth = requireAuth(pool, env.JWT_SECRET);

  router.get('/:userId', auth, async (req: AuthedRequest, res, next) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).end();
        return;
      }
      const r = await pool.query(
        'SELECT avatar_base64 FROM users WHERE id = $1 AND deleted_at IS NULL',
        [userId],
      );
      const raw = (r.rows[0]?.avatar_base64 as string | null | undefined) ?? null;
      const parsed = raw ? parseDataUrl(raw) : null;
      if (!parsed) {
        // Аватара нет — 404; на клиенте <img onError> покажет инициалы.
        res.status(404).end();
        return;
      }

      const etag = `"${crypto.createHash('sha1').update(parsed.buf).digest('hex')}"`;
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('ETag', etag);
      res.setHeader('Content-Type', parsed.mime);
      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }
      res.setHeader('Content-Length', parsed.buf.length);
      res.status(200).end(parsed.buf);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
