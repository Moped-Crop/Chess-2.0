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
import { PRESETS, presetById, switchAfterMove } from '../../src/app/clock/clock';
import { clockFromRow, liveSnapshot, checkFlagged } from '../lib/serverClock';
import { tryApply, reconstructState } from '../gameEngine';
import { markOnline, markOffline, socketsOf } from '../presence';
import { createFriendGame, areFriends } from '../lib/friendGame';
import { markChatInviteStatus, type InviteStatus } from '../lib/chat';

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
// Список id пресетов собирается из PRESETS программно, чтобы zod-enum не мог
// разойтись с clock.ts при добавлении нового контроля времени.
const timeControlIds = PRESETS.map((p) => p.id) as [string, ...string[]];
const inviteSchema = z.object({
  toUserId: z.number().int().positive(),
  timeControlId: z.enum(timeControlIds),
});

/* ---------- Вспомогательные типы ---------- */

interface GameRow {
  id: number;
  white_id: number;
  black_id: number;
  status: string;
  result: string | null;
  moves: Move[];
  time_control_id: string | null;
  white_ms: number | null;
  black_ms: number | null;
  turn_started_at: Date | string | null;
  win_reason: string | null;
}

interface SocketData {
  userId: number;
  joinedGames: Set<number>;
}

/** Причина завершения партии — персистится в games.win_reason. */
type EndReason = 'game' | 'resign' | 'abandon' | 'timeout';

const ABANDON_GRACE_MS = 90_000;

/** Таймеры технического поражения при разрыве: `${gameId}:${userId}`. */
const abandonTimers = new Map<string, NodeJS.Timeout>();

/** Таймеры падения флажка (тайм-аут по часам): ключ — gameId. */
const flagTimers = new Map<number, NodeJS.Timeout>();

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
    let payload: { uid?: unknown; tv?: unknown; exp?: number };
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as typeof payload;
    } catch {
      return next(new Error('unauthorized'));
    }
    if (typeof payload.uid !== 'number' || typeof payload.tv !== 'number') {
      return next(new Error('unauthorized'));
    }
    const uid = payload.uid;
    const tv = payload.tv;
    // Сверяем token_version с базой при подключении: иначе разлогиненная по
    // смене пароля/удалению сессия продолжала бы играть через открытый сокет.
    pool
      .query('SELECT token_version FROM users WHERE id = $1 AND deleted_at IS NULL', [uid])
      .then((r) => {
        const row = r.rows[0] as { token_version: number } | undefined;
        if (!row || row.token_version !== tv) return next(new Error('unauthorized'));
        (socket.data as SocketData).userId = uid;
        (socket.data as SocketData).joinedGames = new Set();
        // Отключить клиента, когда срок действия токена истечёт.
        if (payload.exp) {
          const msLeft = payload.exp * 1000 - Date.now();
          const timer = setTimeout(() => socket.disconnect(true), Math.max(msLeft, 0));
          socket.on('disconnect', () => clearTimeout(timer));
        }
        next();
      })
      .catch(() => next(new Error('unauthorized')));
  });

  /* --- Работа с БД --- */

  async function loadGameRow(gameId: number): Promise<GameRow | null> {
    const r = await pool.query(
      `SELECT id, white_id, black_id, status, result, moves,
              time_control_id, white_ms, black_ms, turn_started_at, win_reason
       FROM games WHERE id = $1`,
      [gameId],
    );
    const row = r.rows[0] as GameRow | undefined;
    if (!row) return null;
    // pg возвращает jsonb разобранным, pg-mem — строкой; нормализуем.
    if (typeof row.moves === 'string') row.moves = JSON.parse(row.moves) as Move[];
    return row;
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

  /**
   * Запланировать падение флажка активной стороны: партия завершится
   * тайм-аутом сама, даже если никто не ходит. Зеркалит abandonTimers.
   * Перед срабатыванием состояние перечитывается из БД — таймер мог устареть
   * (успели сходить/сдаться), тогда он просто молча уходит.
   */
  function scheduleFlagTimer(row: GameRow, activeColor: Color): void {
    clearFlagTimer(row.id);
    const clock = liveSnapshot(row, activeColor);
    if (!clock) return;
    const msLeft = activeColor === 'white' ? clock.whiteMs : clock.blackMs;
    flagTimers.set(
      row.id,
      setTimeout(() => {
        flagTimers.delete(row.id);
        void (async () => {
          const fresh = await loadGameRow(row.id);
          if (!fresh || fresh.status !== 'active') return;
          const freshActive = reconstructState(fresh.moves).turn;
          const flagged = checkFlagged(fresh, freshActive);
          if (!flagged) return; // ход успели сделать чуть раньше — таймер устарел
          await finishByTimeout(fresh, flagged);
        })().catch(() => {
          if (!env.isProd) console.error('flag timer: handler error');
        });
      }, Math.max(0, msLeft)),
    );
  }

  function clearFlagTimer(gameId: number): void {
    const t = flagTimers.get(gameId);
    if (t) {
      clearTimeout(t);
      flagTimers.delete(gameId);
    }
  }

  /** Завершить партию тайм-аутом: обнулить время просрочившего (ресинк
   *  завершённой партии покажет честный 0) и записать причину. */
  async function finishByTimeout(row: GameRow, flagged: Color): Promise<void> {
    if (flagged === 'white') {
      await pool.query('UPDATE games SET white_ms = 0 WHERE id = $1', [row.id]);
    } else {
      await pool.query('UPDATE games SET black_ms = 0 WHERE id = $1', [row.id]);
    }
    const winner: GameResult = flagged === 'white' ? 'black' : 'white';
    await finishGame(row, winner, 'timeout');
  }

  /** Завершить партию: статус, результат, причина, статистика, уведомление. */
  async function finishGame(row: GameRow, result: GameResult, reason: EndReason): Promise<void> {
    // Флажок этой партии больше не нужен — безусловно и молча (партия могла
    // закончиться раньше срабатывания: сдача, разрыв, мат).
    clearFlagTimer(row.id);
    await pool.query(
      `UPDATE games SET status = 'finished', result = $1, win_reason = $2, finished_at = NOW(),
              turn_started_at = NULL
       WHERE id = $3 AND status = 'active'`,
      [result, reason, row.id],
    );
    await updateStats(row.white_id, row.black_id, result);
    io.to(`game:${row.id}`).emit('game-over', { gameId: row.id, result, reason });
  }

  /**
   * Аддитивный хук чата: если эта партия была приглашением ИЗ переписки, у
   * карточки в чате проставляется актуальный статус и обоим участникам летит
   * `chat:invite-status-updated` — открытый тред обновит карточку сам, даже
   * когда решение принято не из чата, а из обычного тоста. Приглашение не из
   * чата не находит строки и ничего не делает.
   */
  async function syncChatInviteCard(
    gameId: number,
    status: InviteStatus,
    userIds: number[],
  ): Promise<void> {
    const card = await markChatInviteStatus(pool, gameId, status);
    if (!card) return;
    for (const uid of userIds) {
      for (const sid of socketsOf(uid)) {
        io.to(sid).emit('chat:invite-status-updated', {
          messageId: card.messageId,
          friendshipId: card.friendshipId,
          status,
        });
      }
    }
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

  /* --- Восстановление флажков после перезапуска сервера ---
   * Партии с часами не должны «зависать», если сервер упал ровно перед
   * падением чьего-то флажка: при старте перечитываем все активные партии с
   * контролем времени и планируем таймеры заново. Если время уже вышло —
   * таймер сработает почти сразу (msLeft ≈ 0). Второй, ленивый слой защиты —
   * проверка в join-game. */
  void (async () => {
    const r = await pool.query(
      `SELECT id, white_id, black_id, status, result, moves,
              time_control_id, white_ms, black_ms, turn_started_at, win_reason
       FROM games
       WHERE status = 'active' AND time_control_id IS NOT NULL AND time_control_id != 'none'`,
    );
    for (const raw of r.rows as GameRow[]) {
      if (typeof raw.moves === 'string') raw.moves = JSON.parse(raw.moves) as Move[];
      if (raw.turn_started_at == null) continue; // часы ещё не инициализированы
      scheduleFlagTimer(raw, reconstructState(raw.moves).turn);
    }
  })().catch(() => {
    if (!env.isProd) console.error('flag timer recovery: query error');
  });

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
    on('friend-invite', inviteSchema, async ({ toUserId, timeControlId }) => {
      if (!(await areFriends(pool, userId, toUserId))) return;

      // Та же функция создаёт партию и для приглашения из чата (chat:invite).
      const { gameId } = await createFriendGame(pool, userId, toUserId, timeControlId);

      const me = await pool.query('SELECT username, display_name FROM users WHERE id = $1', [
        userId,
      ]);
      socket.emit('invite-sent', { gameId });
      for (const sid of socketsOf(toUserId)) {
        io.to(sid).emit('friend-invite', {
          gameId,
          timeControlId,
          from: { username: me.rows[0].username, displayName: me.rows[0].display_name },
        });
      }
    });

    on('invite-accepted', gameIdSchema, async ({ gameId }) => {
      const row = await loadGameRow(gameId);
      if (!row || row.status !== 'waiting' || colorOf(row, userId) === null) return;
      const preset = row.time_control_id ? presetById(row.time_control_id) : null;
      if (preset && preset.mode !== 'none') {
        // Партия с часами: полное время обеим сторонам, отсчёт хода белых —
        // с момента принятия (в том же UPDATE, что и смена статуса).
        await pool.query(
          `UPDATE games SET status = 'active', white_ms = $2, black_ms = $3, turn_started_at = NOW()
           WHERE id = $1`,
          [gameId, preset.baseMs, preset.baseMs],
        );
        scheduleFlagTimer(
          {
            ...row,
            status: 'active',
            white_ms: preset.baseMs,
            black_ms: preset.baseMs,
            turn_started_at: new Date(),
          },
          'white',
        );
      } else {
        await pool.query(`UPDATE games SET status = 'active' WHERE id = $1`, [gameId]);
      }
      for (const uid of [row.white_id, row.black_id]) {
        for (const sid of socketsOf(uid)) io.to(sid).emit('invite-accepted', { gameId });
      }
      await syncChatInviteCard(gameId, 'accepted', [row.white_id, row.black_id]);
    });

    on('invite-declined', gameIdSchema, async ({ gameId }) => {
      const row = await loadGameRow(gameId);
      if (!row || row.status !== 'waiting' || colorOf(row, userId) === null) return;
      await pool.query(`UPDATE games SET status = 'aborted', result = 'aborted' WHERE id = $1`, [
        gameId,
      ]);
      const other = row.white_id === userId ? row.black_id : row.white_id;
      for (const sid of socketsOf(other)) io.to(sid).emit('invite-declined', { gameId });
      await syncChatInviteCard(gameId, 'declined', [row.white_id, row.black_id]);
    });

    /* Вход в партию (первый заход и реконнект). */
    on('join-game', gameIdSchema, async ({ gameId }) => {
      let row = await loadGameRow(gameId);
      const myColor = row ? colorOf(row, userId) : null;
      if (!row || myColor === null) {
        socket.emit('game-error', { gameId, error: 'not_found' });
        return;
      }
      await socket.join(`game:${gameId}`);
      data.joinedGames.add(gameId);
      cancelAbandonTimer(gameId, userId);
      socket.to(`game:${gameId}`).emit('opponent-reconnected', { gameId });

      // Ленивая проверка флажка (второй слой защиты после восстановления при
      // старте): партия фактически просрочена, но ещё числится active —
      // завершаем тайм-аутом прямо здесь и отвечаем уже финальным состоянием.
      if (row.status === 'active') {
        const flagged = checkFlagged(row, reconstructState(row.moves).turn);
        if (flagged) {
          await finishByTimeout(row, flagged);
          row = (await loadGameRow(gameId)) ?? row;
        }
      }

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
        reason: (row.win_reason ?? null) as EndReason | null,
        clock: liveSnapshot(row, reconstructState(row.moves).turn),
        timeControlId: row.time_control_id,
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
      // Часы: списать у ходившего, добавить инкремент, передать ход — той же
      // чистой функцией, что и на клиенте. now — Date.now() (см. serverClock).
      const now = Date.now();
      const clockBefore = clockFromRow(row, before.turn);
      const clockNext = clockBefore
        ? switchAfterMove(clockBefore, before.turn, now, after.result !== 'ongoing')
        : null;
      // Ход сразу в БД — партия переживает перезапуск сервера. Часы — в том же
      // UPDATE (не отдельным запросом).
      if (clockNext) {
        await pool.query(
          `UPDATE games SET moves = $1, white_ms = $2, black_ms = $3, turn_started_at = $4
           WHERE id = $5`,
          [
            JSON.stringify(nextMoves),
            Math.round(clockNext.whiteMs),
            Math.round(clockNext.blackMs),
            clockNext.activeColor !== null ? new Date(now) : null,
            gameId,
          ],
        );
      } else {
        await pool.query('UPDATE games SET moves = $1 WHERE id = $2', [
          JSON.stringify(nextMoves),
          gameId,
        ]);
      }
      // Свежий снэпшот часов в исходящем ходе: клиент соперника синхронизируется
      // на каждом ходу, а не дрейфует локально между редкими ресинками.
      socket.to(`game:${gameId}`).emit('move', { gameId, move, index, clock: clockNext });

      // Перепланировать флажок под новую активную сторону.
      if (clockNext && clockNext.activeColor !== null) {
        scheduleFlagTimer(
          {
            ...row,
            moves: nextMoves,
            white_ms: Math.round(clockNext.whiteMs),
            black_ms: Math.round(clockNext.blackMs),
            turn_started_at: new Date(now),
          },
          clockNext.activeColor,
        );
      }

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
