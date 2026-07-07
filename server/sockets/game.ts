/**
 * Socket.IO-слой онлайн-игры: аутентификация по JWT-cookie, приглашения из
 * списка друзей, комнаты партий, валидация ходов движком, сдача, завершение
 * с обновлением статистики, реконнект с grace-периодом.
 *
 * Защита: JWT проверяется на подключении и по сроку действия (отключение при
 * истечении), token-bucket ограничивает частоту событий каждого сокета,
 * каждое событие валидируется zod и проверкой участия в партии.
 */

import type { Server, Socket } from 'socket.io';
import type pg from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Env } from '../env';
import type { Color, GameResult, Move } from '../../src/engine/types';
import { tryApply, reconstructState } from '../gameEngine';
import { markOnline, markOffline, socketsOf } from '../presence';

/* ---------- Схемы входящих событий ---------- */

const square = z.number().int().min(0).max(79);
const moveSchema = z.object({
  from: square,
  to: square,
  capture: square.optional(),
  promotion: z.enum(['Q', 'R', 'B', 'N', 'ROO']).optional(),
  evolveTo: z
    .enum(['N_OUTRIDER', 'N_HUNTER', 'B_PRELATE', 'B_ZEALOT', 'R_RAM', 'R_ANCHOR', 'ROO_PHOENIX'])
    .optional(),
  special: z.enum(['castle-king', 'castle-queen', 'enpassant']).optional(),
});

const gameIdSchema = z.object({ gameId: z.number().int().positive() });
const moveEventSchema = gameIdSchema.extend({
  move: moveSchema,
  index: z.number().int().min(0),
});
const inviteSchema = z.object({ toUserId: z.number().int().positive() });

/* ---------- Вспомогательные типы ---------- */

interface GameRow {
  id: number;
  white_id: number;
  black_id: number;
  status: string;
  result: string | null;
  moves: Move[];
}

interface SocketData {
  userId: number;
  joinedGames: Set<number>;
}

const ABANDON_GRACE_MS = 90_000;

/** Таймеры технического поражения при разрыве: `${gameId}:${userId}`. */
const abandonTimers = new Map<string, NodeJS.Timeout>();

/* ---------- Разбор cookie заголовка (без внешних зависимостей) ---------- */

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/* ---------- Token bucket: ограничение частоты событий сокета ---------- */

interface Bucket {
  tokens: number;
  last: number;
}

const BUCKET_MAX = 20;
const REFILL_PER_SEC = 4;

function takeToken(bucket: Bucket): boolean {
  const now = Date.now();
  bucket.tokens = Math.min(BUCKET_MAX, bucket.tokens + ((now - bucket.last) / 1000) * REFILL_PER_SEC);
  bucket.last = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function attachGameSockets(io: Server, pool: pg.Pool, env: Env): void {
  /* --- Аутентификация подключения по той же JWT-cookie, что и REST --- */
  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie ?? '');
    const token = cookies['token'];
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { uid?: unknown; exp?: number };
      if (typeof payload.uid !== 'number') return next(new Error('unauthorized'));
      (socket.data as SocketData).userId = payload.uid;
      (socket.data as SocketData).joinedGames = new Set();
      // Отключить клиента, когда срок действия токена истечёт.
      if (payload.exp) {
        const msLeft = payload.exp * 1000 - Date.now();
        const timer = setTimeout(() => socket.disconnect(true), Math.max(msLeft, 0));
        socket.on('disconnect', () => clearTimeout(timer));
      }
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  /* --- Работа с БД --- */

  async function loadGameRow(gameId: number): Promise<GameRow | null> {
    const r = await pool.query(
      'SELECT id, white_id, black_id, status, result, moves FROM games WHERE id = $1',
      [gameId],
    );
    return (r.rows[0] as GameRow | undefined) ?? null;
  }

  async function updateStats(whiteId: number, blackId: number, result: GameResult): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (result === 'draw') {
        await client.query(
          'UPDATE stats SET draws = draws + 1, games_played = games_played + 1 WHERE user_id = $1 OR user_id = $2',
          [whiteId, blackId],
        );
      } else {
        const winner = result === 'white' ? whiteId : blackId;
        const loser = result === 'white' ? blackId : whiteId;
        await client.query(
          'UPDATE stats SET wins = wins + 1, games_played = games_played + 1 WHERE user_id = $1',
          [winner],
        );
        await client.query(
          'UPDATE stats SET losses = losses + 1, games_played = games_played + 1 WHERE user_id = $1',
          [loser],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Завершить партию: статус, результат, статистика, уведомление комнаты. */
  async function finishGame(row: GameRow, result: GameResult, reason: string): Promise<void> {
    await pool.query(
      `UPDATE games SET status = 'finished', result = $1, finished_at = NOW() WHERE id = $2 AND status = 'active'`,
      [result, row.id],
    );
    await updateStats(row.white_id, row.black_id, result);
    io.to(`game:${row.id}`).emit('game-over', { gameId: row.id, result, reason });
  }

  function colorOf(row: GameRow, userId: number): Color | null {
    if (row.white_id === userId) return 'white';
    if (row.black_id === userId) return 'black';
    return null;
  }

  function cancelAbandonTimer(gameId: number, userId: number): void {
    const key = `${gameId}:${userId}`;
    const t = abandonTimers.get(key);
    if (t) {
      clearTimeout(t);
      abandonTimers.delete(key);
    }
  }

  /* --- Подключение --- */

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    const userId = data.userId;
    const bucket: Bucket = { tokens: BUCKET_MAX, last: Date.now() };
    markOnline(userId, socket.id);

    /** Обёртка обработчиков: rate limit + zod + отлов ошибок. */
    function on<T>(event: string, schema: z.ZodType<T>, handler: (input: T) => Promise<void>) {
      socket.on(event, (raw: unknown) => {
        if (!takeToken(bucket)) return; // flood: событие молча игнорируется
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return;
        handler(parsed.data).catch(() => {
          if (!env.isProd) console.error(`socket ${event}: handler error`);
        });
      });
    }

    /* Приглашение друга в партию. */
    on('friend-invite', inviteSchema, async ({ toUserId }) => {
      const friends = await pool.query(
        `SELECT 1 FROM friendships
         WHERE status = 'accepted'
           AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
        [userId, toUserId],
      );
      if ((friends.rowCount ?? 0) === 0) return;

      const meWhite = Math.random() < 0.5;
      const whiteId = meWhite ? userId : toUserId;
      const blackId = meWhite ? toUserId : userId;
      const inserted = await pool.query(
        `INSERT INTO games (white_id, black_id, status) VALUES ($1, $2, 'waiting') RETURNING id`,
        [whiteId, blackId],
      );
      const gameId = inserted.rows[0].id as number;

      const me = await pool.query('SELECT username, display_name FROM users WHERE id = $1', [
        userId,
      ]);
      socket.emit('invite-sent', { gameId });
      for (const sid of socketsOf(toUserId)) {
        io.to(sid).emit('friend-invite', {
          gameId,
          from: { username: me.rows[0].username, displayName: me.rows[0].display_name },
        });
      }
    });

    on('invite-accepted', gameIdSchema, async ({ gameId }) => {
      const row = await loadGameRow(gameId);
      if (!row || row.status !== 'waiting' || colorOf(row, userId) === null) return;
      await pool.query(`UPDATE games SET status = 'active' WHERE id = $1`, [gameId]);
      for (const uid of [row.white_id, row.black_id]) {
        for (const sid of socketsOf(uid)) io.to(sid).emit('invite-accepted', { gameId });
      }
    });

    on('invite-declined', gameIdSchema, async ({ gameId }) => {
      const row = await loadGameRow(gameId);
      if (!row || row.status !== 'waiting' || colorOf(row, userId) === null) return;
      await pool.query(`UPDATE games SET status = 'aborted', result = 'aborted' WHERE id = $1`, [
        gameId,
      ]);
      const other = row.white_id === userId ? row.black_id : row.white_id;
      for (const sid of socketsOf(other)) io.to(sid).emit('invite-declined', { gameId });
    });

    /* Вход в партию (первый заход и реконнект). */
    on('join-game', gameIdSchema, async ({ gameId }) => {
      const row = await loadGameRow(gameId);
      const myColor = row ? colorOf(row, userId) : null;
      if (!row || myColor === null) {
        socket.emit('game-error', { gameId, error: 'not_found' });
        return;
      }
      await socket.join(`game:${gameId}`);
      data.joinedGames.add(gameId);
      cancelAbandonTimer(gameId, userId);
      socket.to(`game:${gameId}`).emit('opponent-reconnected', { gameId });

      const users = await pool.query(
        'SELECT id, username, display_name, avatar_base64 FROM users WHERE id = $1 OR id = $2',
        [row.white_id, row.black_id],
      );
      const byId = new Map(users.rows.map((u) => [u.id as number, u]));
      const pub = (id: number) => {
        const u = byId.get(id);
        return u
          ? { username: u.username, displayName: u.display_name, avatarBase64: u.avatar_base64 }
          : { username: '?', displayName: '?', avatarBase64: null };
      };
      socket.emit('game-state', {
        gameId,
        myColor,
        status: row.status,
        result: (row.result ?? 'ongoing') as GameResult,
        moves: row.moves,
        players: { white: pub(row.white_id), black: pub(row.black_id) },
      });
    });

    /* Ход: строгая серверная валидация движком. */
    on('move', moveEventSchema, async ({ gameId, move, index }) => {
      const row = await loadGameRow(gameId);
      const myColor = row ? colorOf(row, userId) : null;
      if (!row || myColor === null || row.status !== 'active') {
        socket.emit('move-rejected', { gameId });
        return;
      }
      // Клиент должен строить ход на актуальной позиции...
      if (row.moves.length !== index) {
        socket.emit('move-rejected', { gameId });
        return;
      }
      // ...и сейчас должна быть его очередь.
      const before = reconstructState(row.moves);
      if (before.turn !== myColor) {
        socket.emit('move-rejected', { gameId });
        return;
      }
      const after = tryApply(row.moves, move as Move);
      if (!after) {
        socket.emit('move-rejected', { gameId });
        return;
      }

      const nextMoves = [...row.moves, move];
      // Ход сразу в БД — партия переживает перезапуск сервера.
      await pool.query('UPDATE games SET moves = $1 WHERE id = $2', [
        JSON.stringify(nextMoves),
        gameId,
      ]);
      socket.to(`game:${gameId}`).emit('move', { gameId, move, index });

      if (after.result !== 'ongoing') {
        await finishGame(row, after.result, 'game');
      }
    });

    /* Сдача. */
    on('resign', gameIdSchema, async ({ gameId }) => {
      const row = await loadGameRow(gameId);
      const myColor = row ? colorOf(row, userId) : null;
      if (!row || myColor === null || row.status !== 'active') return;
      const winner: GameResult = myColor === 'white' ? 'black' : 'white';
      await finishGame(row, winner, 'resign');
    });

    /* Разрыв соединения: grace-период до технического поражения. */
    socket.on('disconnect', () => {
      markOffline(userId, socket.id);
      const stillConnected = socketsOf(userId).length > 0;
      for (const gameId of data.joinedGames) {
        if (stillConnected) continue; // другая вкладка держит партию
        socket.to(`game:${gameId}`).emit('opponent-disconnected', { gameId });
        const key = `${gameId}:${userId}`;
        if (abandonTimers.has(key)) continue;
        abandonTimers.set(
          key,
          setTimeout(() => {
            abandonTimers.delete(key);
            void (async () => {
              const row = await loadGameRow(gameId);
              if (!row || row.status !== 'active') return;
              if (socketsOf(userId).length > 0) return; // успел вернуться
              const winner: GameResult = row.white_id === userId ? 'black' : 'white';
              await finishGame(row, winner, 'abandon');
            })().catch(() => {});
          }, ABANDON_GRACE_MS),
        );
      }
    });
  });
}
