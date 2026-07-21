/**
 * История партий (supertest + pg-mem): постраничный список завершённых
 * партий, полная партия для повтора, запрет доступа НЕ-участнику.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestApp, registerUser, agentWithCsrf, type TestCtx } from './testApp';
import { sq } from '../../src/engine/board';
import type { Move } from '../../src/engine/types';

let ctx: TestCtx;

beforeEach(async () => {
  ctx = await makeTestApp();
});

const E2E4: Move = { from: sq(4, 1), to: sq(4, 3) };

interface GameOpts {
  result?: string | null;
  winReason?: string | null;
  tc?: string | null;
  moves?: Move[];
  finishedAt?: Date;
  status?: string;
}

async function insertGame(whiteId: number, blackId: number, o: GameOpts = {}): Promise<number> {
  const r = await ctx.pool.query(
    `INSERT INTO games (white_id, black_id, status, result, win_reason, time_control_id, moves, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      whiteId,
      blackId,
      o.status ?? 'finished',
      o.result ?? 'white',
      o.winReason === undefined ? 'resign' : o.winReason,
      o.tc === undefined ? '3+2' : o.tc,
      JSON.stringify(o.moves ?? [E2E4]),
      o.finishedAt ?? new Date(),
    ],
  );
  return r.rows[0].id as number;
}

describe('GET /api/games/history', () => {
  it('returns own finished games newest first with opponent and myColor', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');

    const older = await insertGame(alice.id, bob.id, {
      finishedAt: new Date(Date.now() - 60_000),
      result: 'white',
      winReason: 'timeout',
    });
    const newer = await insertGame(bob.id, alice.id, { result: 'draw', winReason: 'game' });
    await insertGame(alice.id, bob.id, { status: 'active', result: null, winReason: null }); // живая — не в истории
    await insertGame(bob.id, carol.id); // чужая — не в истории Алисы

    const r = await alice.agent.get('/api/games/history');
    expect(r.status).toBe(200);
    expect(r.body.hasMore).toBe(false);
    expect(r.body.games).toHaveLength(2);
    // Свежие сверху.
    expect(r.body.games[0].id).toBe(newer);
    expect(r.body.games[1].id).toBe(older);
    // Соперник и свой цвет — с точки зрения зрителя.
    expect(r.body.games[0]).toMatchObject({
      myColor: 'black',
      result: 'draw',
      winReason: 'game',
      timeControlId: '3+2',
      opponent: { username: 'bob' },
    });
    expect(r.body.games[1]).toMatchObject({ myColor: 'white', winReason: 'timeout' });
  });

  it('paginates by 20 with hasMore', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    for (let i = 0; i < 21; i++) {
      await insertGame(alice.id, bob.id, { finishedAt: new Date(Date.now() - i * 1000) });
    }
    const p1 = await alice.agent.get('/api/games/history?page=1');
    expect(p1.body.games).toHaveLength(20);
    expect(p1.body.hasMore).toBe(true);
    const p2 = await alice.agent.get('/api/games/history?page=2');
    expect(p2.body.games).toHaveLength(1);
    expect(p2.body.hasMore).toBe(false);
  });

  it('requires authentication', async () => {
    const { agent } = await agentWithCsrf(ctx.app);
    const r = await agent.get('/api/games/history');
    expect(r.status).toBe(401);
  });
});

describe('GET /api/games/:id', () => {
  it('returns the full game to a participant', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const id = await insertGame(alice.id, bob.id, {
      result: 'black',
      winReason: 'timeout',
      moves: [E2E4],
    });

    const r = await bob.agent.get(`/api/games/${id}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id,
      result: 'black',
      winReason: 'timeout',
      timeControlId: '3+2',
      myColor: 'black',
    });
    expect(r.body.moves).toEqual([E2E4]);
    expect(r.body.players.white.username).toBe('alice');
    expect(r.body.players.black.username).toBe('bob');
  });

  it('lets an outsider replay a FINISHED game (profiles show game history)', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const mallory = await registerUser(ctx, 'mallory');
    const id = await insertGame(alice.id, bob.id, { moves: [E2E4] });

    const r = await mallory.agent.get(`/api/games/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.moves).toEqual([E2E4]);
    // Своего цвета у стороннего зрителя нет — доска по умолчанию белыми вниз.
    expect(r.body.myColor).toBe('white');
  });

  it('hides an ONGOING game from an outsider (no watching a live game)', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const mallory = await registerUser(ctx, 'mallory');
    const id = await insertGame(alice.id, bob.id, { status: 'active', result: null, winReason: null });

    const outsider = await mallory.agent.get(`/api/games/${id}`);
    expect(outsider.status).toBe(404);
    expect(outsider.body.error).toBe('not_found');
    // Участнику своя идущая партия по-прежнему доступна.
    expect((await alice.agent.get(`/api/games/${id}`)).status).toBe(200);
  });

  it('requires authentication and validates the id', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bad = await alice.agent.get('/api/games/abc');
    expect(bad.status).toBe(400);

    const { agent } = await agentWithCsrf(ctx.app);
    const anon = await agent.get('/api/games/1');
    expect(anon.status).toBe(401);
  });
});
