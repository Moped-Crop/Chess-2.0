/**
 * Матчмейкинг (реальный Socket.IO + pg-mem): двое в очереди → сразу партия;
 * трое → матчится ближайшая по рейтингу пара, третий ждёт; непересекающиеся
 * контроли времени не матчатся; дисконнект убирает из очереди; игрок в активной
 * партии в очередь не встаёт. Аутентификацию сокета ставит attachGameSockets
 * (io.use) — поэтому в тесте подключены оба слоя.
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
import { attachMatchmakingSockets } from '../../server/sockets/matchmaking';
import { TEST_ENV } from './testApp';

let pool: pg.Pool;
let httpServer: http.Server;
let ioServer: SocketIOServer;
let port: number;
const clients: ClientSocket[] = [];

async function makeUser(username: string, rating: number): Promise<number> {
  const r = await pool.query(
    `INSERT INTO users (username, display_name, email, password_hash)
     VALUES ($1, $1, $2, 'hash') RETURNING id`,
    [username, `${username}@test.dev`],
  );
  const id = r.rows[0].id as number;
  await pool.query('INSERT INTO stats (user_id, rating) VALUES ($1, $2)', [id, rating]);
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

/** true, если событие НЕ пришло за ms. */
function expectNoEvent(socket: ClientSocket, event: string, ms = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve(true);
    }, ms);
    const onEvent = () => {
      clearTimeout(timer);
      resolve(false);
    };
    socket.once(event, onEvent);
  });
}

beforeEach(async () => {
  pool = await createPool('memory://');
  await runMigrations(pool);
  httpServer = http.createServer();
  ioServer = new SocketIOServer(httpServer, { serveClient: false });
  attachGameSockets(ioServer, pool, TEST_ENV);
  attachMatchmakingSockets(ioServer, pool, TEST_ENV);
  await new Promise<void>((r) => httpServer.listen(0, r));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await ioServer.close();
});

describe('двое в очереди → сразу партия', () => {
  it('оба получают mm:matched с одним gameId; партия рейтинговая и активная', async () => {
    const alice = await makeUser('alice', 1000);
    const bob = await makeUser('bob', 1050);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    a.emit('mm:join', { timeControls: ['3+0', '5+0'] });
    await waitFor(a, 'mm:queued');

    const matchedA = waitFor<{ gameId: number }>(a, 'mm:matched');
    const matchedB = waitFor<{ gameId: number }>(b, 'mm:matched');
    b.emit('mm:join', { timeControls: ['5+0'] });
    const [ma, mb] = await Promise.all([matchedA, matchedB]);
    expect(ma.gameId).toBe(mb.gameId);

    const g = await pool.query(
      'SELECT status, is_ranked, white_id, black_id, time_control_id FROM games WHERE id = $1',
      [ma.gameId],
    );
    expect(g.rows[0].status).toBe('active');
    expect(g.rows[0].is_ranked).toBe(true);
    expect(g.rows[0].time_control_id).toBe('5+0'); // пересечение = 5+0
    // Цвета — это как раз двое игроков.
    expect([g.rows[0].white_id, g.rows[0].black_id].sort()).toEqual([alice, bob].sort());
  });
});

describe('трое в очереди → ближайшая по рейтингу пара', () => {
  it('матчатся двое с минимальным разрывом рейтинга, третий остаётся', async () => {
    // alice и bob не пересекаются по TC и остаются в очереди; carol пересекается
    // с обоими. По рейтингу carol(1190) ближе к bob(1200), чем к alice(1000) →
    // должны сматчиться bob и carol, alice — ждать.
    const alice = await makeUser('alice', 1000);
    const bob = await makeUser('bob', 1200);
    const carol = await makeUser('carol', 1190);
    const a = connectAs(alice);
    const b = connectAs(bob);
    const c = connectAs(carol);
    await Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect'), waitFor(c, 'connect')]);

    a.emit('mm:join', { timeControls: ['3+0'] });
    await waitFor(a, 'mm:queued');
    b.emit('mm:join', { timeControls: ['5+0'] });
    await waitFor(b, 'mm:queued');

    const matchedB = waitFor<{ gameId: number }>(b, 'mm:matched');
    const matchedC = waitFor<{ gameId: number }>(c, 'mm:matched');
    const aliceStays = expectNoEvent(a, 'mm:matched', 500);
    c.emit('mm:join', { timeControls: ['3+0', '5+0'] });

    const [mb, mc] = await Promise.all([matchedB, matchedC]);
    expect(mb.gameId).toBe(mc.gameId);
    expect(await aliceStays).toBe(true); // alice не сматчена

    const g = await pool.query('SELECT white_id, black_id, time_control_id FROM games WHERE id = $1', [
      mb.gameId,
    ]);
    expect([g.rows[0].white_id, g.rows[0].black_id].sort()).toEqual([bob, carol].sort());
    expect(g.rows[0].time_control_id).toBe('5+0'); // пара bob/carol пересекается по 5+0
  });
});

describe('непересекающиеся контроли времени не матчатся', () => {
  it('двое с разными TC остаются в очереди', async () => {
    const alice = await makeUser('alice', 1000);
    const bob = await makeUser('bob', 1005);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')]);

    a.emit('mm:join', { timeControls: ['3+0'] });
    await waitFor(a, 'mm:queued');
    const noMatchA = expectNoEvent(a, 'mm:matched', 500);
    b.emit('mm:join', { timeControls: ['10+0'] });
    await waitFor(b, 'mm:queued');
    expect(await noMatchA).toBe(true);
  });
});

describe('дисконнект убирает из очереди', () => {
  it('после ухода первого второй не находит соперника', async () => {
    const alice = await makeUser('alice', 1000);
    const bob = await makeUser('bob', 1000);
    const a = connectAs(alice);
    await waitFor(a, 'connect');
    a.emit('mm:join', { timeControls: ['3+0'] });
    await waitFor(a, 'mm:queued');
    a.disconnect();
    // Небольшая пауза, чтобы сервер обработал disconnect.
    await new Promise((r) => setTimeout(r, 150));

    const b = connectAs(bob);
    await waitFor(b, 'connect');
    const noMatch = expectNoEvent(b, 'mm:matched', 500);
    b.emit('mm:join', { timeControls: ['3+0'] });
    const queued = await waitFor<{ size: number }>(b, 'mm:queued');
    expect(queued.size).toBe(1); // только bob — alice выбыла по дисконнекту
    expect(await noMatch).toBe(true);
  });
});

describe('игрок в активной партии не может встать в очередь', () => {
  it('отвечает mm:error и не встаёт', async () => {
    const alice = await makeUser('alice', 1000);
    const bob = await makeUser('bob', 1000);
    await pool.query(
      `INSERT INTO games (white_id, black_id, status) VALUES ($1, $2, 'active')`,
      [alice, bob],
    );
    const a = connectAs(alice);
    await waitFor(a, 'connect');
    const err = waitFor<{ error: string }>(a, 'mm:error');
    const noQueue = expectNoEvent(a, 'mm:queued', 500);
    a.emit('mm:join', { timeControls: ['3+0'] });
    expect((await err).error).toBe('already_in_game');
    expect(await noQueue).toBe(true);
  });
});
