/**
 * Публичный профиль другого игрока по нику: имя, аватар, онлайн-статус,
 * статистика и история его завершённых партий. Только чтение, только для
 * залогиненных.
 */

import { Router } from 'express';
import type { Response } from 'express';
import type pg from 'pg';
import type { Env } from '../env';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { isOnline } from '../presence';
import { listFinishedGames } from '../lib/gameHistory';

/** Тот же формат логина, что и в заявке в друзья. */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

interface PlayerRow {
  id: number;
  username: string;
  display_name: string;
  avatar_base64: string | null;
  deleted_at: Date | string | null;
}

export function playersRouter(pool: pg.Pool, env: Env): Router {
  const router = Router();
  const auth = requireAuth(pool, env.JWT_SECRET);

  /**
   * Найти игрока по нику. Сам отвечает на кривой ник и на «не найден»;
   * `null` означает, что ответ уже отправлен и делать больше нечего.
   */
  async function loadPlayer(req: AuthedRequest, res: Response): Promise<PlayerRow | null> {
    // В типах Express параметр — string | string[]; всё, что не подходит под
    // формат логина, отсекается регуляркой.
    const username = String(req.params.username);
    if (!USERNAME_RE.test(username)) {
      res.status(400).json({ error: 'validation' });
      return null;
    }
    const r = await pool.query(
      'SELECT id, username, display_name, avatar_base64, deleted_at FROM users WHERE username = $1',
      [username],
    );
    if ((r.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    return r.rows[0] as PlayerRow;
  }

  router.get('/:username', auth, async (req: AuthedRequest, res, next) => {
    try {
      const u = await loadPlayer(req, res);
      if (!u) return;

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

  /**
   * Завершённые партии игрока, свежие сверху, теми же страницами по 20, что и
   * своя история. У анонимизированного аккаунта истории нет — его партии
   * остались в истории соперников, но собственного профиля у него больше нет.
   */
  router.get('/:username/games', auth, async (req: AuthedRequest, res, next) => {
    try {
      const u = await loadPlayer(req, res);
      if (!u) return;
      if (u.deleted_at != null) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const page = Math.max(1, Number(req.query.page) || 1);
      res.json(await listFinishedGames(pool, u.id, page));
    } catch (e) {
      next(e);
    }
  });

  return router;
}
