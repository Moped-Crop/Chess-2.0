/**
 * Лидерборд: топ игроков по рейтингу, постранично. Только чтение, только для
 * залогиненных.
 *
 * Два инварианта (см. CLAUDE.md):
 *  - `users.deleted_at IS NULL` — удалённые (анонимизированные) аккаунты в
 *    таблице не показываются;
 *  - порог `ranked_games_played >= MIN_RANKED` — человек с одной случайной
 *    победой не должен оказаться в топе.
 */

import { Router } from 'express';
import type pg from 'pg';
import type { Env } from '../env';
import { requireAuth, type AuthedRequest } from '../middleware/auth';

const PAGE_SIZE = 25;
/** Минимум рейтинговых партий, чтобы попасть в таблицу. */
const MIN_RANKED = 5;

interface Row {
  username: string;
  display_name: string;
  avatar_base64: string | null;
  rating: number;
  ranked_games_played: number;
  ranked_wins: number;
  ranked_losses: number;
  ranked_draws: number;
}

export function leaderboardRouter(pool: pg.Pool, env: Env): Router {
  const router = Router();
  const auth = requireAuth(pool, env.JWT_SECRET);

  router.get('/', auth, async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const page = Math.max(1, Number(req.query.page) || 1);
      const offset = (page - 1) * PAGE_SIZE;

      // Одна лишняя строка сверх страницы — так узнаём hasMore без COUNT.
      const r = await pool.query(
        `SELECT u.username, u.display_name, u.avatar_base64,
                s.rating, s.ranked_games_played, s.ranked_wins, s.ranked_losses, s.ranked_draws
         FROM stats s JOIN users u ON u.id = s.user_id
         WHERE u.deleted_at IS NULL AND s.ranked_games_played >= $1
         ORDER BY s.rating DESC, u.id ASC
         LIMIT $2 OFFSET $3`,
        [MIN_RANKED, PAGE_SIZE + 1, offset],
      );
      const rows = (r.rows as Row[]).slice(0, PAGE_SIZE);
      const entries = rows.map((row, i) => ({
        place: offset + i + 1,
        username: row.username,
        displayName: row.display_name,
        avatarBase64: row.avatar_base64,
        rating: row.rating,
        ranked: {
          gamesPlayed: row.ranked_games_played,
          wins: row.ranked_wins,
          losses: row.ranked_losses,
          draws: row.ranked_draws,
        },
      }));

      // Своя строка: место считаем через COUNT(rating > моего) + 1, чтобы она
      // была видна, даже если игрок не попал на текущую страницу списка.
      const meRow = await pool.query(
        'SELECT rating, ranked_games_played FROM stats WHERE user_id = $1',
        [uid],
      );
      const mine = meRow.rows[0] as { rating: number; ranked_games_played: number } | undefined;
      const rankedGamesPlayed = mine?.ranked_games_played ?? 0;
      const eligible = rankedGamesPlayed >= MIN_RANKED;
      let place: number | null = null;
      if (mine && eligible) {
        const ahead = await pool.query(
          `SELECT COUNT(*) AS cnt FROM stats s JOIN users u ON u.id = s.user_id
           WHERE u.deleted_at IS NULL AND s.ranked_games_played >= $1 AND s.rating > $2`,
          [MIN_RANKED, mine.rating],
        );
        place = Number((ahead.rows[0] as { cnt: number | string }).cnt) + 1;
      }

      res.json({
        page,
        pageSize: PAGE_SIZE,
        minRanked: MIN_RANKED,
        entries,
        hasMore: r.rows.length > PAGE_SIZE,
        me: {
          rating: mine?.rating ?? 1000,
          rankedGamesPlayed,
          eligible,
          gamesToQualify: eligible ? 0 : MIN_RANKED - rankedGamesPlayed,
          place,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
