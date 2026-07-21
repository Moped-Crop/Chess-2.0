/**
 * Публичный профиль другого игрока по нику: имя, аватар, онлайн-статус и
 * статистика. Только чтение, только для залогиненных.
 *
 * Историю партий этого игрока здесь НЕ отдаём — это отдельный, более
 * чувствительный с точки зрения приватности вопрос.
 */

import { Router } from 'express';
import type pg from 'pg';
import type { Env } from '../env';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { isOnline } from '../presence';

/** Тот же формат логина, что и в заявке в друзья. */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export function playersRouter(pool: pg.Pool, env: Env): Router {
  const router = Router();
  const auth = requireAuth(pool, env.JWT_SECRET);

  router.get('/:username', auth, async (req: AuthedRequest, res, next) => {
    try {
      // В типах Express параметр — string | string[]; всё, что не подходит под
      // формат логина, отсекается регуляркой ниже.
      const username = String(req.params.username);
      if (!USERNAME_RE.test(username)) {
        res.status(400).json({ error: 'validation' });
        return;
      }

      const r = await pool.query(
        'SELECT id, username, display_name, avatar_base64, deleted_at FROM users WHERE username = $1',
        [username],
      );
      if ((r.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const u = r.rows[0] as {
        id: number;
        username: string;
        display_name: string;
        avatar_base64: string | null;
        deleted_at: Date | string | null;
      };

      // Удалённый аккаунт анонимизирован, а не стёрт (на него ссылаются
      // партии других игроков). Отдаём голую заглушку — без статистики и
      // аватара; фронтенд покажет карточку «аккаунт удалён».
      if (u.deleted_at != null) {
        res.json({ deleted: true, id: u.id, username: u.username });
        return;
      }

      const s = await pool.query(
        'SELECT wins, losses, draws, games_played FROM stats WHERE user_id = $1',
        [u.id],
      );
      const st = s.rows[0] as
        | { wins: number; losses: number; draws: number; games_played: number }
        | undefined;

      res.json({
        deleted: false,
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        avatarBase64: u.avatar_base64,
        online: isOnline(u.id),
        stats: {
          wins: st?.wins ?? 0,
          losses: st?.losses ?? 0,
          draws: st?.draws ?? 0,
          gamesPlayed: st?.games_played ?? 0,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
