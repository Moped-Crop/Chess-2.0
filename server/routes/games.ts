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

const PAGE_SIZE = 20;

interface HistoryRow {
  id: number;
  result: string | null;
  win_reason: string | null;
  time_control_id: string | null;
  finished_at: Date | string | null;
  white_id: number;
  black_id: number;
  username: string;
  display_name: string;
  avatar_base64: string | null;
}

export function gamesRouter(pool: pg.Pool, env: Env): Router {
  const router = Router();
  const auth = requireAuth(pool, env.JWT_SECRET);

  /** Список завершённых партий пользователя, свежие сверху, по 20 на страницу. */
  router.get('/history', auth, async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const page = Math.max(1, Number(req.query.page) || 1);
      const offset = (page - 1) * PAGE_SIZE;
      // LIMIT на одну строку больше страницы — так узнаём hasMore без COUNT.
      const r = await pool.query(
        `SELECT g.id, g.result, g.win_reason, g.time_control_id, g.finished_at,
                g.white_id, g.black_id,
                u.username, u.display_name, u.avatar_base64
         FROM games g
         JOIN users u
           ON u.id = CASE WHEN g.white_id = $1 THEN g.black_id ELSE g.white_id END
         WHERE (g.white_id = $1 OR g.black_id = $1) AND g.status = 'finished'
         ORDER BY g.finished_at DESC
         LIMIT $2 OFFSET $3`,
        [uid, PAGE_SIZE + 1, offset],
      );
      const rows = (r.rows as HistoryRow[]).slice(0, PAGE_SIZE);
      res.json({
        games: rows.map((g) => ({
          id: g.id,
          opponent: {
            username: g.username,
            displayName: g.display_name,
            avatarBase64: g.avatar_base64,
          },
          myColor: g.white_id === uid ? 'white' : 'black',
          result: g.result,
          winReason: g.win_reason,
          timeControlId: g.time_control_id,
          finishedAt: g.finished_at,
        })),
        hasMore: r.rows.length > PAGE_SIZE,
      });
    } catch (e) {
      next(e);
    }
  });

  /** Партия целиком для повтора — только участнику. Чужая партия отвечает
   *  тем же 404, что и несуществующая (не палим сам факт её существования). */
  router.get('/:id', auth, async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'validation' });
        return;
      }
      const r = await pool.query(
        `SELECT id, white_id, black_id, status, result, win_reason, time_control_id, moves, finished_at
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
          }
        | undefined;
      if (!g || (g.white_id !== uid && g.black_id !== uid)) {
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
        myColor: g.white_id === uid ? 'white' : 'black',
        players: { white: pub(g.white_id), black: pub(g.black_id) },
        finishedAt: g.finished_at,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
