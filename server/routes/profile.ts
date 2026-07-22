/**
 * Профиль: обновление имени/аватара и чтение статистики.
 * Аватар — data-URL (png/jpeg/webp), жёсткий лимит размера на сервере.
 */

import { Router } from 'express';
import type pg from 'pg';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Env } from '../env';
import { validate } from '../middleware/validate';
import { requireAuth, type AuthedRequest } from '../middleware/auth';

// ~200 КБ бинарных данных ≈ 273К символов base64 (+ заголовок data-URL).
const AVATAR_MAX_CHARS = 280_000;

const updateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(64).optional(),
    avatarBase64: z
      .string()
      .max(AVATAR_MAX_CHARS, 'Аватар слишком большой')
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Неверный формат изображения')
      .nullable()
      .optional(),
  })
  .refine((v) => v.displayName !== undefined || v.avatarBase64 !== undefined, {
    message: 'Пустой запрос',
  });

export function profileRouter(pool: pg.Pool, env: Env): Router {
  const router = Router();
  const auth = requireAuth(pool, env.JWT_SECRET);

  const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  router.put('/profile', auth, limiter, validate(updateSchema), async (req: AuthedRequest, res, next) => {
    try {
      const { displayName, avatarBase64 } = req.body as z.infer<typeof updateSchema>;
      // Параметризованные запросы; собираем только заданные поля.
      if (displayName !== undefined) {
        await pool.query('UPDATE users SET display_name = $1 WHERE id = $2', [
          displayName,
          req.userId,
        ]);
      }
      if (avatarBase64 !== undefined) {
        await pool.query('UPDATE users SET avatar_base64 = $1 WHERE id = $2', [
          avatarBase64,
          req.userId,
        ]);
      }
      const r = await pool.query(
        'SELECT id, username, display_name, avatar_base64 FROM users WHERE id = $1',
        [req.userId],
      );
      const u = r.rows[0];
      res.json({
        user: {
          id: u.id,
          username: u.username,
          displayName: u.display_name,
          avatarBase64: u.avatar_base64,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/stats/:userId', auth, async (req, res, next) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).json({ error: 'validation' });
        return;
      }
      const r = await pool.query(
        `SELECT s.wins, s.losses, s.draws, s.games_played,
                s.rating, s.peak_rating,
                s.ranked_games_played, s.ranked_wins, s.ranked_losses, s.ranked_draws,
                u.username, u.display_name
         FROM stats s JOIN users u ON u.id = s.user_id
         WHERE s.user_id = $1`,
        [userId],
      );
      if ((r.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const row = r.rows[0];
      res.json({
        stats: {
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          gamesPlayed: row.games_played,
        },
        rating: row.rating,
        peakRating: row.peak_rating,
        ranked: {
          gamesPlayed: row.ranked_games_played,
          wins: row.ranked_wins,
          losses: row.ranked_losses,
          draws: row.ranked_draws,
        },
        username: row.username,
        displayName: row.display_name,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
