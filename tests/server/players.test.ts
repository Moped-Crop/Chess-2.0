/**
 * Публичный профиль игрока (supertest + pg-mem): обычный пользователь,
 * несуществующий ник, удалённый (анонимизированный) аккаунт, доступ без входа.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestApp, registerUser, type TestCtx } from './testApp';

let ctx: TestCtx;

beforeEach(async () => {
  ctx = await makeTestApp();
});

describe('GET /api/players/:username', () => {
  it('returns the public card of another player', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    await bob.agent
      .put('/api/profile')
      .set('X-CSRF-Token', bob.csrf)
      .send({ displayName: 'Боб' });

    const r = await alice.agent.get('/api/players/bob');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      deleted: false,
      id: bob.id,
      username: 'bob',
      displayName: 'Боб',
      avatarBase64: null,
      // Сокетов в тесте нет — офлайн.
      online: false,
      stats: { wins: 0, losses: 0, draws: 0, gamesPlayed: 0 },
    });
  });

  it('returns 404 for an unknown username and 400 for a malformed one', async () => {
    const alice = await registerUser(ctx, 'alice');
    expect((await alice.agent.get('/api/players/nobody99')).status).toBe(404);
    expect((await alice.agent.get('/api/players/ab')).status).toBe(400);
    expect((await alice.agent.get('/api/players/bad-name!')).status).toBe(400);
  });

  it('deleted account: only the stub, no stats and no avatar', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');

    // Настоящий флоу удаления: пароль → код из письма → подтверждение.
    await bob.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', bob.csrf)
      .send({ currentPassword: 'password-123' });
    const code = ctx.mailer.lastCode()!;
    await bob.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', bob.csrf)
      .send({ currentPassword: 'password-123', emailCode: code });

    // Старый ник больше никому не принадлежит.
    expect((await alice.agent.get('/api/players/bob')).status).toBe(404);

    const r = await alice.agent.get(`/api/players/deleted_user_${bob.id}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ deleted: true, id: bob.id, username: `deleted_user_${bob.id}` });
  });

  it('requires an authenticated session', async () => {
    const alice = await registerUser(ctx, 'alice');
    await registerUser(ctx, 'bob');
    await alice.agent.post('/api/auth/logout').set('X-CSRF-Token', alice.csrf);
    expect((await alice.agent.get('/api/players/bob')).status).toBe(401);
  });
});

describe('GET /api/players/:username/games', () => {
  async function insertGame(
    whiteId: number,
    blackId: number,
    o: { status?: string; result?: string; finishedAt?: Date } = {},
  ) {
    const r = await ctx.pool.query(
      `INSERT INTO games (white_id, black_id, status, result, win_reason, time_control_id, moves, finished_at)
       VALUES ($1, $2, $3, $4, 'resign', '3+2', '[]', $5) RETURNING id`,
      [whiteId, blackId, o.status ?? 'finished', o.result ?? 'white', o.finishedAt ?? new Date()],
    );
    return r.rows[0].id as number;
  }

  it("returns the player's finished games from THEIR point of view", async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');

    // Боб играл чёрными против Кэрол и проиграл.
    const vsCarol = await insertGame(carol.id, bob.id, { result: 'white' });
    // Идущая партия в историю не попадает.
    await insertGame(bob.id, carol.id, { status: 'active' });

    const r = await alice.agent.get('/api/players/bob/games');
    expect(r.status).toBe(200);
    expect(r.body.hasMore).toBe(false);
    expect(r.body.games).toHaveLength(1);
    // Цвет и соперник — Боба, а не смотрящей Алисы.
    expect(r.body.games[0]).toMatchObject({
      id: vsCarol,
      playerColor: 'black',
      result: 'white',
      opponent: { username: 'carol' },
    });
  });

  it('paginates by 20 like the own history does', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    for (let i = 0; i < 21; i++) {
      await insertGame(bob.id, alice.id, { finishedAt: new Date(Date.now() - i * 1000) });
    }
    const p1 = await alice.agent.get('/api/players/bob/games?page=1');
    expect(p1.body.games).toHaveLength(20);
    expect(p1.body.hasMore).toBe(true);
    const p2 = await alice.agent.get('/api/players/bob/games?page=2');
    expect(p2.body.games).toHaveLength(1);
    expect(p2.body.hasMore).toBe(false);
  });

  it('a game found on a profile really opens for replay', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    await insertGame(bob.id, carol.id);

    const list = await alice.agent.get('/api/players/bob/games');
    const gameId = list.body.games[0].id as number;
    // Алиса в этой партии не участвовала — и всё равно может её посмотреть.
    expect((await alice.agent.get(`/api/games/${gameId}`)).status).toBe(200);
  });

  it('unknown and deleted players have no history', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    await insertGame(alice.id, bob.id);

    expect((await alice.agent.get('/api/players/nobody99/games')).status).toBe(404);

    await bob.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', bob.csrf)
      .send({ currentPassword: 'password-123' });
    await bob.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', bob.csrf)
      .send({ currentPassword: 'password-123', emailCode: ctx.mailer.lastCode()! });

    const r = await alice.agent.get(`/api/players/deleted_user_${bob.id}/games`);
    expect(r.status).toBe(404);
    // Партия при этом жива и осталась в истории Алисы.
    expect((await alice.agent.get('/api/games/history')).body.games).toHaveLength(1);
  });
});
