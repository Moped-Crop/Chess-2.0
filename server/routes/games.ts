/**
 * История онлайн-партий: постраничный список завершённых партий текущего
 * пользователя и полная партия для повтора ходов. Только REST — партия
 * неизменна, сокет-соединение странице повтора не нужно.
 */

import { Router } from 'express';
import type pg from 'pg';
import type { Move } from '../../src/engine/types';
import type { Env } from '../env';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { listFinishedGames } from '../lib/gameHistory';

export function gamesRouter(pool: pg.Pool, env: Env): Router {
  const router = Router();
  const auth = requireAuth(pool, env.JWT_SECRET);

  /** Список завершённых партий пользователя, свежие сверху, по 20 на страницу. */
  router.get('/history', auth, async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const page = Math.max(1, Number(req.query.page) || 1);
      const { games, hasMore } = await listFinishedGames(pool, uid, page);
      // В своей истории цвет игрока — это «мой цвет»; имя поля не меняем,
      // чтобы не ломать уже работающий фронтенд.
      res.json({
        games: games.map(({ playerColor, ...g }) => ({ ...g, myColor: playerColor })),
        hasMore,
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * Партия целиком для повтора.
   *
   * ЗАВЕРШЁННАЯ партия открыта любому вошедшему пользователю: профиль игрока
   * показывает его историю, и она должна открываться (так же устроены lichess
   * и chess.com). ИДУЩАЯ партия по-прежнему видна только участникам — иначе
   * посторонний мог бы следить за живой игрой и подсказывать сопернику.
   * Недоступная партия отвечает тем же 404, что и несуществующая.
   */
  router.get('/:id', auth, async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'validation' });
        return;
      }
      const r = await pool.query(
        `SELECT id, white_id, black_id, status, result, win_reason, time_control_id, moves, finished_at,
                is_ranked, white_rating_delta, black_rating_delta
         FROM games WHERE id = $1`,
        [id],
      );
      const g = r.rows[0] as
        | {
            id: number;
            white_id: number;
            black_id: number;
            status: string;
            result: string | null;
            win_reason: string | null;
            time_control_id: string | null;
            moves: Move[] | string;
            finished_at: Date | string | null;
            is_ranked: boolean;
            white_rating_delta: number | null;
            black_rating_delta: number | null;
          }
        | undefined;
      const isPlayer = !!g && (g.white_id === uid || g.black_id === uid);
      if (!g || (!isPlayer && g.status !== 'finished')) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const users = await pool.query(
        'SELECT id, username, display_name, avatar_base64 FROM users WHERE id = $1 OR id = $2',
        [g.white_id, g.black_id],
      );
      const byId = new Map(users.rows.map((u) => [u.id as number, u]));
      const pub = (userId: number) => {
        const u = byId.get(userId);
        return u
          ? { username: u.username, displayName: u.display_name, avatarBase64: u.avatar_base64 }
          : { username: '?', displayName: '?', avatarBase64: null };
      };
      res.json({
        id: g.id,
        moves: typeof g.moves === 'string' ? (JSON.parse(g.moves) as Move[]) : g.moves,
        status: g.status,
        result: g.result,
        winReason: g.win_reason,
        timeControlId: g.time_control_id,
        // Для стороннего зрителя своего цвета нет — доска по умолчанию белыми
        // вниз; страница повтора при заходе из профиля развернёт её сама.
        myColor: g.black_id === uid ? 'black' : 'white',
        players: { white: pub(g.white_id), black: pub(g.black_id) },
        finishedAt: g.finished_at,
        isRanked: g.is_ranked,
        // Дельта рейтинга ИМЕННО зрителя (если он участник рейтинговой партии).
        ratingDelta: isPlayer
          ? g.white_id === uid
            ? g.white_rating_delta
            : g.black_rating_delta
          : null,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
