/**
 * Создание партии по приглашению друга. Общая функция для двух точек входа:
 * обычного `friend-invite` из списка друзей и `chat:invite` из переписки —
 * SQL создания партии не дублируется.
 */

import type pg from 'pg';

/** Приняли ли эти двое друг друга в друзья. */
export async function areFriends(pool: pg.Pool, a: number, b: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [a, b],
  );
  return (r.rowCount ?? 0) > 0;
}

export interface CreatedGame {
  gameId: number;
  whiteId: number;
  blackId: number;
}

/**
 * Партия в статусе 'waiting': цвета распределяются жребием, часы ставятся
 * позже — при `invite-accepted` (см. server/sockets/game.ts).
 */
export async function createFriendGame(
  pool: pg.Pool,
  inviterId: number,
  inviteeId: number,
  timeControlId: string,
): Promise<CreatedGame> {
  const inviterWhite = Math.random() < 0.5;
  const whiteId = inviterWhite ? inviterId : inviteeId;
  const blackId = inviterWhite ? inviteeId : inviterId;
  const inserted = await pool.query(
    `INSERT INTO games (white_id, black_id, status, time_control_id)
     VALUES ($1, $2, 'waiting', $3) RETURNING id`,
    [whiteId, blackId, timeControlId],
  );
  return { gameId: inserted.rows[0].id as number, whiteId, blackId };
}
