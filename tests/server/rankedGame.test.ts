/**
 * Применение рейтинга при завершении партии (реальный Socket.IO + pg-mem):
 * рейтинговая партия меняет рейтинг обоих и пишет дельты в games; нерейтинговая
 * рейтинг не трогает, но обычную статистику обновляет; завершение по причине не
 * 'game' (тайм-аут — тот же путь, что и abandon) тоже списывает рейтинг;
 * несостоявшаяся партия (aborted через отклонение приглашения) рейтинг не
 * трогает; множитель повторных встреч гасит серию.
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

interface GameStatePayload {
  myColor: string;
}
function joinGame(socket: ClientSocket, gameId: number): Promise<GameStatePayload> {
  const p = waitFor<GameStatePayload>(socket, 'game-state');
  socket.emit('join-game', { gameId });
  return p;
}

/** Активная партия без часов. */
async function makeGame(w: number, b: number, isRanked: boolean): Promise<number> {
  const r = await pool.query(
    `INSERT INTO games (white_id, black_id, status, is_ranked)
     VALUES ($1, $2, 'active', $3) RETURNING id`,
    [w, b, isRanked],
  );
  return r.rows[0].id as number;
}

async function stats(userId: number) {
  const r = await pool.query(
    `SELECT rating, peak_rating, ranked_games_played, ranked_wins, ranked_losses, ranked_draws,
            wins, losses, draws, games_played
     FROM stats WHERE user_id = $1`,
    [userId],
  );
  return r.rows[0] as {
    rating: number;
    peak_rating: number;
    ranked_games_played: number;
    ranked_wins: number;
    ranked_losses: number;
    ranked_draws: number;
    wins: number;
    losses: number;
    draws: number;
    games_played: number;
  };
}

interface GameOverPayload {
  result: string;
  reason: string;
  rating: { white: { delta: number; newRating: number }; black: { delta: number; newRating: number } } | null;
}

const E2E4: Move = { from: sq(4, 1), to: sq(4, 3) };

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

describe('рейтинговая партия меняет рейтинг обоих', () => {
  it('сдача: победитель +30, проигравший −30 (равные, K=60), дельты в games и в game-over', async () => {
    const alice = await makeUser('alice'); // white
    const bob = await makeUser('bob'); // black
    const gameId = await makeGame(alice, bob, true);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const overA = waitFor<GameOverPayload>(a, 'game-over');
    a.emit('resign', { gameId }); // белые сдаются → побеждают чёрные
    const over = await overA;

    expect(over.result).toBe('black');
    expect(over.rating).not.toBeNull();
    expect(over.rating!.white).toEqual({ delta: -30, newRating: 970 });
    expect(over.rating!.black).toEqual({ delta: 30, newRating: 1030 });

    const sw = await stats(alice);
    const sb = await stats(bob);
    expect(sw.rating).toBe(970);
    expect(sb.rating).toBe(1030);
    expect(sb.peak_rating).toBe(1030); // пик подрос
    expect(sw.peak_rating).toBe(1000); // пик не опускается
    expect(sw).toMatchObject({ ranked_games_played: 1, ranked_losses: 1, ranked_wins: 0 });
    expect(sb).toMatchObject({ ranked_games_played: 1, ranked_wins: 1, ranked_losses: 0 });
    // Обычная статистика тоже обновилась.
    expect(sw).toMatchObject({ losses: 1, games_played: 1 });
    expect(sb).toMatchObject({ wins: 1, games_played: 1 });

    // Дельты и before записаны в games.
    const g = await pool.query(
      'SELECT white_rating_before, black_rating_before, white_rating_delta, black_rating_delta FROM games WHERE id = $1',
      [gameId],
    );
    expect(g.rows[0]).toMatchObject({
      white_rating_before: 1000,
      black_rating_before: 1000,
      white_rating_delta: -30,
      black_rating_delta: 30,
    });
  });
});

describe('нерейтинговая партия рейтинг не трогает', () => {
  it('обычную статистику обновляет, рейтинг — нет, game-over.rating = null', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const gameId = await makeGame(alice, bob, false);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const overB = waitFor<GameOverPayload>(b, 'game-over');
    a.emit('resign', { gameId });
    const over = await overB;
    expect(over.rating).toBeNull();

    const sw = await stats(alice);
    const sb = await stats(bob);
    expect(sw.rating).toBe(1000);
    expect(sb.rating).toBe(1000);
    expect(sw.ranked_games_played).toBe(0);
    expect(sb.ranked_games_played).toBe(0);
    // Обычная статистика всё равно посчитана.
    expect(sw).toMatchObject({ losses: 1, games_played: 1 });
    expect(sb).toMatchObject({ wins: 1, games_played: 1 });

    const g = await pool.query('SELECT white_rating_delta, is_ranked FROM games WHERE id = $1', [
      gameId,
    ]);
    expect(g.rows[0].white_rating_delta).toBeNull();
    expect(g.rows[0].is_ranked).toBe(false);
  });
});

describe('завершение по причине не "game" тоже списывает рейтинг', () => {
  it('тайм-аут в рейтинговой партии меняет рейтинг (тот же путь, что и abandon)', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    // Ранкед-партия с часами: у чёрных 400 мс, после хода белых флажок падает.
    const r = await pool.query(
      `INSERT INTO games (white_id, black_id, status, is_ranked, time_control_id, white_ms, black_ms, turn_started_at)
       VALUES ($1, $2, 'active', true, '1+0', 60000, 400, $3) RETURNING id`,
      [alice, bob, new Date(Date.now() - 1000)],
    );
    const gameId = r.rows[0].id as number;
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const overA = waitFor<GameOverPayload>(a, 'game-over');
    a.emit('move', { gameId, move: E2E4, index: 0 }); // запускает отсчёт чёрных
    const over = await overA;
    expect(over.result).toBe('white');
    expect(over.reason).toBe('timeout');
    expect(over.rating).not.toBeNull();
    // Белые выиграли по времени → рейтинг вырос, у чёрных — упал.
    expect(over.rating!.white.delta).toBeGreaterThan(0);
    expect(over.rating!.black.delta).toBeLessThan(0);

    const sw = await stats(alice);
    expect(sw.rating).toBeGreaterThan(1000);
    expect(sw.ranked_wins).toBe(1);
  });
});

describe('несостоявшаяся партия (aborted) рейтинг не трогает', () => {
  it('отклонённое рейтинговое приглашение не меняет рейтинг', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    // Рейтинговая партия в статусе waiting (приглашение ещё не принято).
    const r = await pool.query(
      `INSERT INTO games (white_id, black_id, status, is_ranked) VALUES ($1, $2, 'waiting', true) RETURNING id`,
      [alice, bob],
    );
    const gameId = r.rows[0].id as number;
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const declined = waitFor(a, 'invite-declined');
    b.emit('invite-declined', { gameId }); // чёрные (bob) отклоняют
    await declined;

    const g = await pool.query('SELECT status, is_ranked, white_rating_delta FROM games WHERE id = $1', [
      gameId,
    ]);
    expect(g.rows[0].status).toBe('aborted');
    expect(g.rows[0].is_ranked).toBe(true); // партия была рейтинговой…
    expect(g.rows[0].white_rating_delta).toBeNull(); // …но рейтинг не тронут

    expect((await stats(alice)).rating).toBe(1000);
    expect((await stats(bob)).rating).toBe(1000);
    expect((await stats(alice)).ranked_games_played).toBe(0);
  });
});

describe('множитель повторных встреч гасит серию', () => {
  it('6-я рейтинговая партия пары за сутки не меняет рейтинг', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    // 5 уже завершённых рейтинговых партий этой пары за последний час.
    for (let i = 0; i < 5; i++) {
      await pool.query(
        `INSERT INTO games (white_id, black_id, status, result, is_ranked, finished_at)
         VALUES ($1, $2, 'finished', 'white', true, $3)`,
        [alice, bob, new Date(Date.now() - 60_000)],
      );
    }
    // 6-я — живая, её и завершаем.
    const gameId = await makeGame(alice, bob, true);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const overA = waitFor<GameOverPayload>(a, 'game-over');
    a.emit('resign', { gameId });
    const over = await overA;
    // Множитель 0 → рейтинг не меняется, но партия «сыграна».
    expect(over.rating!.white.delta).toBe(0);
    expect(over.rating!.black.delta).toBe(0);
    expect((await stats(alice)).rating).toBe(1000);
    expect((await stats(bob)).rating).toBe(1000);

    const g = await pool.query('SELECT white_rating_delta, black_rating_delta FROM games WHERE id = $1', [
      gameId,
    ]);
    expect(g.rows[0]).toMatchObject({ white_rating_delta: 0, black_rating_delta: 0 });
  });
});
