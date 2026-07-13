/**
 * Socket.IO-слой (реальный сервер на эфемерном порту + pg-mem): подключение и
 * аутентификация, приглашение, комната, синхронизация ходов, отклонение
 * нелегального хода, реконнект, завершение партии со статистикой.
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
  // token_version по умолчанию 0 (см. makeUser) — токен должен нести tv.
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

/** Создать активную партию напрямую в БД (белые = w, чёрные = b). */
async function makeActiveGame(w: number, b: number): Promise<number> {
  const r = await pool.query(
    `INSERT INTO games (white_id, black_id, status) VALUES ($1, $2, 'active') RETURNING id`,
    [w, b],
  );
  return r.rows[0].id as number;
}

const E2E4: Move = { from: sq(4, 1), to: sq(4, 3) };

/** JSONB из pg-mem приходит строкой — нормализуем для проверок. */
function asMoves(v: unknown): Move[] {
  return typeof v === 'string' ? (JSON.parse(v) as Move[]) : (v as Move[]);
}

/** join-game с подпиской ДО отправки (иначе гонка с ответом сервера). */
function joinGame(socket: ClientSocket, gameId: number): Promise<{ myColor: string; moves: Move[] }> {
  const p = waitFor<{ myColor: string; moves: Move[] }>(socket, 'game-state');
  socket.emit('join-game', { gameId });
  return p;
}

describe('socket authentication', () => {
  it('accepts a valid JWT cookie and rejects a missing one', async () => {
    const alice = await makeUser('alice');
    const ok = connectAs(alice);
    await waitFor(ok, 'connect');

    const bad = ioClient(`http://127.0.0.1:${port}`, { reconnection: false });
    clients.push(bad);
    const err = await waitFor<Error>(bad, 'connect_error');
    expect(String(err)).toContain('unauthorized');
  });
});

describe('invites', () => {
  it('friend invite creates a game and both sides get invite-accepted', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    await pool.query(
      `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')`,
      [alice, bob],
    );
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const invitePromise = waitFor<{ gameId: number; timeControlId: string }>(b, 'friend-invite');
    a.emit('friend-invite', { toUserId: bob, timeControlId: 'none' });
    const invite = await invitePromise;
    expect(invite.gameId).toBeGreaterThan(0);
    expect(invite.timeControlId).toBe('none');

    const aAccepted = waitFor<{ gameId: number }>(a, 'invite-accepted');
    const bAccepted = waitFor<{ gameId: number }>(b, 'invite-accepted');
    b.emit('invite-accepted', { gameId: invite.gameId });
    expect((await aAccepted).gameId).toBe(invite.gameId);
    expect((await bAccepted).gameId).toBe(invite.gameId);
  });

  it('invite with a time control stores it and clocks start on accept', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    await pool.query(
      `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')`,
      [alice, bob],
    );
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const invitePromise = waitFor<{ gameId: number; timeControlId: string }>(b, 'friend-invite');
    a.emit('friend-invite', { toUserId: bob, timeControlId: '3+2' });
    const invite = await invitePromise;
    expect(invite.timeControlId).toBe('3+2');

    // Партия создана с выбранным контролем, часы ещё не инициализированы.
    const before = await pool.query(
      'SELECT time_control_id, white_ms, black_ms, turn_started_at FROM games WHERE id = $1',
      [invite.gameId],
    );
    expect(before.rows[0]).toMatchObject({
      time_control_id: '3+2',
      white_ms: null,
      black_ms: null,
    });

    // После принятия обе стороны получают полную базу (3 мин), отсчёт пошёл.
    const accepted = waitFor<{ gameId: number }>(a, 'invite-accepted');
    b.emit('invite-accepted', { gameId: invite.gameId });
    await accepted;
    const after = await pool.query(
      'SELECT status, white_ms, black_ms, turn_started_at FROM games WHERE id = $1',
      [invite.gameId],
    );
    expect(after.rows[0]).toMatchObject({ status: 'active', white_ms: 180_000, black_ms: 180_000 });
    expect(after.rows[0].turn_started_at).not.toBeNull();
  });

  it('invite without a required time control field is ignored', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    await pool.query(
      `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')`,
      [alice, bob],
    );
    const a = connectAs(alice);
    await waitFor(a, 'connect');
    a.emit('friend-invite', { toUserId: bob }); // старый payload без timeControlId
    await new Promise((r) => setTimeout(r, 400));
    const games = await pool.query('SELECT id FROM games');
    expect(games.rowCount).toBe(0);
  });

  it('does not create a game for non-friends', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const a = connectAs(alice);
    await waitFor(a, 'connect');
    a.emit('friend-invite', { toUserId: bob, timeControlId: 'none' });
    await new Promise((r) => setTimeout(r, 400));
    const games = await pool.query('SELECT id FROM games');
    expect(games.rowCount).toBe(0);
  });
});

describe('game room and moves', () => {
  it('joins, syncs a legal move to the opponent and persists it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const gameId = await makeActiveGame(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);

    const stateA = await joinGame(a, gameId);
    const stateB = await joinGame(b, gameId);
    expect(stateA.myColor).toBe('white');
    expect(stateB.myColor).toBe('black');

    const moveAtB = waitFor<{ move: Move }>(b, 'move');
    a.emit('move', { gameId, move: E2E4, index: 0 });
    expect((await moveAtB).move).toEqual(E2E4);

    const row = await pool.query('SELECT moves FROM games WHERE id = $1', [gameId]);
    expect(asMoves(row.rows[0].moves)).toHaveLength(1);
  });

  it('rejects an illegal move and a move out of turn', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const gameId = await makeActiveGame(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    // Чёрные лезут вне очереди.
    const rejB = waitFor(b, 'move-rejected');
    b.emit('move', { gameId, move: { from: sq(4, 6), to: sq(4, 4) }, index: 0 });
    await rejB;

    // Белые шлют нелегальный ход.
    const rejA = waitFor(a, 'move-rejected');
    a.emit('move', { gameId, move: { from: sq(0, 0), to: sq(0, 5) }, index: 0 });
    await rejA;

    const row = await pool.query('SELECT moves FROM games WHERE id = $1', [gameId]);
    expect(asMoves(row.rows[0].moves)).toHaveLength(0);
  });

  it('reconnect: a fresh socket receives the accumulated moves', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const gameId = await makeActiveGame(alice, bob);
    const a = connectAs(alice);
    await joinGame(a, gameId);
    a.emit('move', { gameId, move: E2E4, index: 0 });
    await new Promise((r) => setTimeout(r, 300));
    a.disconnect();

    const a2 = connectAs(alice);
    const state = await joinGame(a2, gameId);
    expect(state.moves).toHaveLength(1);
  });

  it('resign finishes the game and updates both stats', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const gameId = await makeActiveGame(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await joinGame(a, gameId);
    await joinGame(b, gameId);

    const overA = waitFor<{ result: string; reason: string }>(a, 'game-over');
    const overB = waitFor<{ result: string; reason: string }>(b, 'game-over');
    b.emit('resign', { gameId });
    const over = await overA;
    await overB;
    expect(over.result).toBe('white');
    expect(over.reason).toBe('resign');

    const g = await pool.query('SELECT status, result FROM games WHERE id = $1', [gameId]);
    expect(g.rows[0]).toMatchObject({ status: 'finished', result: 'white' });

    const stats = await pool.query(
      'SELECT user_id, wins, losses, games_played FROM stats ORDER BY user_id',
    );
    const aliceStats = stats.rows.find((r) => r.user_id === alice);
    const bobStats = stats.rows.find((r) => r.user_id === bob);
    expect(aliceStats).toMatchObject({ wins: 1, losses: 0, games_played: 1 });
    expect(bobStats).toMatchObject({ wins: 0, losses: 1, games_played: 1 });
  });
});
