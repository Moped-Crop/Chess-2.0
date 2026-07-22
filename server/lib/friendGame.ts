/**
 * Создание партии по приглашению друга. Общая функция для трёх точек входа:
 * обычного `friend-invite` из списка друзей, `chat:invite` из переписки и
 * матчмейкинга (`mm:matched`) — SQL создания партии не дублируется.
 */

import type pg from 'pg';
import { presetById } from '../../src/app/clock/clock';

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

export interface CreateGameOptions {
  /** Рейтинговая партия (is_ranked = true). По умолчанию нет. */
  ranked?: boolean;
  /**
   * Стартовать партию немедленно в статусе 'active' с уже инициализированными
   * часами — для матчмейкинга (экрана подтверждения нет). По умолчанию false:
   * создаётся 'waiting'-партия, часы ставятся при `invite-accepted`.
   */
  active?: boolean;
}

/**
 * Цвета распределяются жребием. Для 'waiting'-партии часы ставятся позже (при
 * принятии приглашения, см. server/sockets/game.ts); для сразу 'active'
 * (матчмейкинг) часы инициализируются здесь же — тем же способом, что и при
 * `invite-accepted`.
 */
export async function createFriendGame(
  pool: pg.Pool,
  inviterId: number,
  inviteeId: number,
  timeControlId: string,
  options: CreateGameOptions = {},
): Promise<CreatedGame> {
  const { ranked = false, active = false } = options;
  const inviterWhite = Math.random() < 0.5;
  const whiteId = inviterWhite ? inviterId : inviteeId;
  const blackId = inviterWhite ? inviteeId : inviterId;

  if (active) {
    const preset = presetById(timeControlId);
    const timed = preset.mode !== 'none';
    const baseMs = timed ? preset.baseMs : null;
    const inserted = await pool.query(
      `INSERT INTO games
         (white_id, black_id, status, time_control_id, is_ranked, white_ms, black_ms, turn_started_at)
       VALUES ($1, $2, 'active', $3, $4, $5, $5, $6) RETURNING id`,
      [whiteId, blackId, timeControlId, ranked, baseMs, timed ? new Date() : null],
    );
    return { gameId: inserted.rows[0].id as number, whiteId, blackId };
  }

  const inserted = await pool.query(
    `INSERT INTO games (white_id, black_id, status, time_control_id, is_ranked)
     VALUES ($1, $2, 'waiting', $3, $4) RETURNING id`,
    [whiteId, blackId, timeControlId, ranked],
  );
  return { gameId: inserted.rows[0].id as number, whiteId, blackId };
}
