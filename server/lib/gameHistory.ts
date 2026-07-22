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
  is_ranked: boolean;
  white_rating_delta: number | null;
  black_rating_delta: number | null;
  opponent_id: number;
  username: string;
  display_name: string;
  opp_rating: number | null;
}

export interface HistoryGame {
  id: number;
  /** Соперник ИМЕННО этого игрока (может оказаться и самим зрителем). */
  opponent: { id: number; username: string; displayName: string; rating: number };
  /** Цвет игрока, чью историю смотрим, — от него считается победа/поражение. */
  playerColor: 'white' | 'black';
  result: string | null;
  winReason: string | null;
  timeControlId: string | null;
  finishedAt: Date | string | null;
  /** Рейтинговая ли партия — бейдж «Рейтинговая»/«Обычная» в истории. */
  isRanked: boolean;
  /** Изменение рейтинга ИМЕННО этого игрока (или null для нерейтинговых). */
  ratingDelta: number | null;
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
            g.white_id, g.black_id, g.is_ranked, g.white_rating_delta, g.black_rating_delta,
            u.id AS opponent_id, u.username, u.display_name, s.rating AS opp_rating
     FROM games g
     JOIN users u
       ON u.id = CASE WHEN g.white_id = $1 THEN g.black_id ELSE g.white_id END
     LEFT JOIN stats s ON s.user_id = u.id
     WHERE (g.white_id = $1 OR g.black_id = $1) AND g.status = 'finished'
     ORDER BY g.finished_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, HISTORY_PAGE_SIZE + 1, offset],
  );
  const rows = (r.rows as HistoryRow[]).slice(0, HISTORY_PAGE_SIZE);
  return {
    games: rows.map((g) => {
      const playerColor: 'white' | 'black' = g.white_id === userId ? 'white' : 'black';
      return {
        id: g.id,
        opponent: {
          id: g.opponent_id,
          username: g.username,
          displayName: g.display_name,
          rating: g.opp_rating ?? 1000,
        },
        playerColor,
        result: g.result,
        winReason: g.win_reason,
        timeControlId: g.time_control_id,
        finishedAt: g.finished_at,
        isRanked: g.is_ranked,
        // Дельта именно этого игрока (сервер отдаёт свою, не обе).
        ratingDelta: playerColor === 'white' ? g.white_rating_delta : g.black_rating_delta,
      };
    }),
    hasMore: r.rows.length > HISTORY_PAGE_SIZE,
  };
}
