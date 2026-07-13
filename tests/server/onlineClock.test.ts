/**
 * Онлайн-часы (реальный Socket.IO-сервер + pg-mem): списание времени при
 * ходе, инкремент, снэпшот часов в событии move, остановка часов и
 * персистентная причина завершения (win_reason).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import type pg from 'pg';
import type { AddressInfo } from 'node:net';
import { createPool } from '../../server/db/pool';
import { runMigrations } from '../../server/db/migrate';
import { attachGameSockets } from '../../server/sockets/game';
import { TEST_ENV } from './testApp';
import { sq } from '../../src/engine/board';
import type { Move } from '../../src/engine/types';
import type { ClockState } from '../../src/app/clock/clock';

let pool: pg.Pool;
let httpServer: http.Server;
let ioServer: SocketIOServer;
let port: number;
const clients: ClientSocket[] = [];

async function makeUser(username: string): Promise<number> {
  const r = await pool.query(
    `INSERT INTO users (username, display_name, email, password_hash)
     VALUES ($1, $1, $2, 'hash') RETURNING id`,
    [username, `${username}@test.dev`],
  );
  const id = r.rows[0].id as number;
  await pool.query('INSERT INTO stats (user_id) VALUES ($1)', [id]);
  return id;
}

function connectAs(userId: number): ClientSocket {
  const token = jwt.sign({ uid: userId, tv: 0 }, TEST_ENV.JWT_SECRET, { expiresIn: 3600 });
  const c = ioClient(`http://127.0.0.1:${port}`, {
    extraHeaders: { Cookie: `token=${token}` },
    reconnection: false,
  });
  clients.push(c);
  return c;
}

function waitFor<T>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

beforeEach(async () => {
  pool = await createPool('memory://');
  await runMigrations(pool);
  httpServer = http.createServer();
  ioServer = new SocketIOServer(httpServer, { serveClient: false });
  attachGameSockets(ioServer, pool, TEST_ENV);
  await new Promise<void>((r) => httpServer.listen(0, r));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await ioServer.close();
});

/** Активная партия с часами; startedAgoMs — сколько мс назад начался ход. */
async function makeTimedGame(
  w: number,
  b: number,
  timeControlId: string,
  whiteMs: number,
  blackMs: number,
  startedAgoMs: number,
): Promise<number> {
  const r = await pool.query(
    `INSERT INTO games (white_id, black_id, status, time_control_id, white_ms, black_ms, turn_started_at)
     VALUES ($1, $2, 'active', $3, $4, $5, $6) RETURNING id`,
    [w, b, timeControlId, whiteMs, blackMs, new Date(Date.now() - startedAgoMs)],
  );
  return r.rows[0].id as number;
}

interface GameStatePayload {
  myColor: string;
  status: string;
  result: string;
  reason: string | null;
  clock: ClockState | null;
  timeControlId: string | null;
}

function joinGame(socket: ClientSocket, gameId: number): Promise<GameStatePayload> {
  const p = waitFor<GameStatePayload>(socket, 'game-state');
  socket.emit('join-game', { gameId });
  return p;
}

const E2E4: Move = { from: sq(4, 1), to: sq(4, 3) };

describe('clock on moves', () => {
  it('debits the mover, adds the increment and syncs a snapshot to the opponent', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    // Блиц 3+2, ход белых начался ~5 секунд назад.
    const gameId = await makeTimedGame(alice, bob, '3+2', 180_000, 180_000, 5_000);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const moveAtB = waitFor<{ move: Move; clock: ClockState | null }>(b, 'move');
    a.emit('move', { gameId, move: E2E4, index: 0 });
    const got = await moveAtB;

    // Снэпшот в событии: у белых списано ~5с и добавлено +2с инкремента.
    expect(got.clock).not.toBeNull();
    const clock = got.clock as ClockState;
    expect(clock.whiteMs).toBeLessThanOrEqual(177_100); // 180000 − ~5000 + 2000
    expect(clock.whiteMs).toBeGreaterThan(172_000);
    expect(clock.blackMs).toBe(180_000);
    expect(clock.activeColor).toBe('black');

    // То же самое сохранено в БД, отсчёт хода чёрных пошёл.
    const row = await pool.query(
      'SELECT white_ms, black_ms, turn_started_at FROM games WHERE id = $1',
      [gameId],
    );
    expect(row.rows[0].white_ms).toBeLessThanOrEqual(177_100);
    expect(row.rows[0].black_ms).toBe(180_000);
    expect(row.rows[0].turn_started_at).not.toBeNull();
  });

  it('a game without a clock still moves fine and sends clock: null', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const r = await pool.query(
      `INSERT INTO games (white_id, black_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [alice, bob],
    );
    const gameId = r.rows[0].id as number;
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const moveAtB = waitFor<{ move: Move; clock: ClockState | null }>(b, 'move');
    a.emit('move', { gameId, move: E2E4, index: 0 });
    expect((await moveAtB).clock).toBeNull();
  });
});

describe('flag timer (timeout)', () => {
  it('finishes the game by timeout on its own, without any player action', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    // У чёрных остаётся 400 мс — после хода белых их флажок должен упасть сам.
    const gameId = await makeTimedGame(alice, bob, '1+0', 60_000, 400, 1_000);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const overA = waitFor<{ result: string; reason: string }>(a, 'game-over');
    const overB = waitFor<{ result: string; reason: string }>(b, 'game-over');
    a.emit('move', { gameId, move: E2E4, index: 0 }); // запускает отсчёт чёрных
    const over = await overA;
    await overB;
    expect(over.result).toBe('white');
    expect(over.reason).toBe('timeout');

    const row = await pool.query(
      'SELECT status, result, win_reason, black_ms, turn_started_at FROM games WHERE id = $1',
      [gameId],
    );
    expect(row.rows[0]).toMatchObject({
      status: 'finished',
      result: 'white',
      win_reason: 'timeout',
      black_ms: 0,
    });
    expect(row.rows[0].turn_started_at).toBeNull();

    // Победа по времени попала в статистику.
    const stats = await pool.query('SELECT user_id, wins, losses FROM stats ORDER BY user_id');
    expect(stats.rows.find((r) => r.user_id === alice)).toMatchObject({ wins: 1, losses: 0 });
    expect(stats.rows.find((r) => r.user_id === bob)).toMatchObject({ wins: 0, losses: 1 });
  });

  it('recovers flag timers after a server restart (expired game finishes)', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    // Ход белых начался 3 секунды назад, а оставалось 200 мс: время уже вышло,
    // но «старый» сервер (beforeEach) об этой партии не знает — как после
    // перезапуска.
    const gameId = await makeTimedGame(alice, bob, '1+0', 200, 60_000, 3_000);

    // «Новый» сервер: восстановление при старте должно подобрать партию.
    const http2 = http.createServer();
    const io2 = new SocketIOServer(http2, { serveClient: false });
    attachGameSockets(io2, pool, TEST_ENV);
    try {
      let row: { status: string } | undefined;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const q = await pool.query('SELECT status, result, win_reason FROM games WHERE id = $1', [
          gameId,
        ]);
        row = q.rows[0];
        if (row?.status === 'finished') break;
      }
      expect(row).toMatchObject({ status: 'finished', result: 'black', win_reason: 'timeout' });
    } finally {
      await io2.close();
    }
  });
});

describe('join-game resync', () => {
  it('a live timed game syncs with a running clock snapshot', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const gameId = await makeTimedGame(alice, bob, '3+2', 180_000, 170_000, 2_000);
    const a = connectAs(alice);

    const state = await joinGame(a, gameId);
    expect(state.timeControlId).toBe('3+2');
    expect(state.reason).toBeNull();
    expect(state.clock).not.toBeNull();
    const clock = state.clock as ClockState;
    expect(clock.activeColor).toBe('white'); // ходов нет — очередь белых
    expect(clock.whiteMs).toBeLessThanOrEqual(178_100); // ~2с уже утекло
    expect(clock.blackMs).toBe(170_000);
  });

  it('resync of a resigned game returns the stored reason', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const gameId = await makeTimedGame(alice, bob, '3+2', 180_000, 180_000, 500);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const over = waitFor(a, 'game-over');
    b.emit('resign', { gameId });
    await over;

    // Новый сокет (реконнект): причина берётся из БД, а не из живого события.
    const a2 = connectAs(alice);
    const state = await joinGame(a2, gameId);
    expect(state.status).toBe('finished');
    expect(state.result).toBe('white');
    expect(state.reason).toBe('resign');
    expect((state.clock as ClockState).activeColor).toBeNull(); // часы стоят
  });

  it('lazily finishes an expired game right in join-game', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    // Время белых вышло 5 секунд назад; таймеров у сервера нет (партия
    // вставлена в БД напрямую — имитация пропущенного восстановления).
    const gameId = await makeTimedGame(alice, bob, '1+0', 100, 60_000, 5_000);
    const a = connectAs(alice);

    const state = await joinGame(a, gameId);
    expect(state.status).toBe('finished');
    expect(state.result).toBe('black');
    expect(state.reason).toBe('timeout');
    expect((state.clock as ClockState).whiteMs).toBe(0);

    const row = await pool.query('SELECT status, win_reason FROM games WHERE id = $1', [gameId]);
    expect(row.rows[0]).toMatchObject({ status: 'finished', win_reason: 'timeout' });
  });
});

describe('finishing stops the clock and persists the reason', () => {
  it('resign stores win_reason and clears turn_started_at', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const gameId = await makeTimedGame(alice, bob, '3+2', 180_000, 180_000, 1_000);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const overA = waitFor<{ result: string; reason: string }>(a, 'game-over');
    b.emit('resign', { gameId });
    const over = await overA;
    expect(over.result).toBe('white');
    expect(over.reason).toBe('resign');

    const row = await pool.query(
      'SELECT status, result, win_reason, turn_started_at FROM games WHERE id = $1',
      [gameId],
    );
    expect(row.rows[0]).toMatchObject({
      status: 'finished',
      result: 'white',
      win_reason: 'resign',
    });
    expect(row.rows[0].turn_started_at).toBeNull();
  });
});
