/**
 * Постраничный список завершённых партий одного игрока. Общий для своей
 * истории (`/api/games/history`) и для истории другого игрока
 * (`/api/players/:username/games`) — запрос не дублируется.
 */

import type pg from 'pg';

export const HISTORY_PAGE_SIZE = 20;

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

export interface HistoryGame {
  id: number;
  /** Соперник ИМЕННО этого игрока (может оказаться и самим зрителем). */
  opponent: { username: string; displayName: string; avatarBase64: string | null };
  /** Цвет игрока, чью историю смотрим, — от него считается победа/поражение. */
  playerColor: 'white' | 'black';
  result: string | null;
  winReason: string | null;
  timeControlId: string | null;
  finishedAt: Date | string | null;
}

export async function listFinishedGames(
  pool: pg.Pool,
  userId: number,
  page: number,
): Promise<{ games: HistoryGame[]; hasMore: boolean }> {
  const offset = (Math.max(1, page) - 1) * HISTORY_PAGE_SIZE;
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
    [userId, HISTORY_PAGE_SIZE + 1, offset],
  );
  const rows = (r.rows as HistoryRow[]).slice(0, HISTORY_PAGE_SIZE);
  return {
    games: rows.map((g) => ({
      id: g.id,
      opponent: {
        username: g.username,
        displayName: g.display_name,
        avatarBase64: g.avatar_base64,
      },
      playerColor: g.white_id === userId ? 'white' : 'black',
      result: g.result,
      winReason: g.win_reason,
      timeControlId: g.time_control_id,
      finishedAt: g.finished_at,
    })),
    hasMore: r.rows.length > HISTORY_PAGE_SIZE,
  };
}
