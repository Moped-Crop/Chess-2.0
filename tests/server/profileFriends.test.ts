/**
 * Профиль и друзья (supertest + pg-mem): обновление профиля, лимит аватара,
 * статистика; заявки в друзья — принятие, самозаявка, дубли, отклонение.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestApp, registerUser, type TestCtx } from './testApp';

let ctx: TestCtx;

beforeEach(async () => {
  ctx = await makeTestApp();
});

describe('PUT /api/profile', () => {
  it('updates display name and returns the fresh user', async () => {
    const u = await registerUser(ctx, 'alice');
    const r = await u.agent
      .put('/api/profile')
      .set('X-CSRF-Token', u.csrf)
      .send({ displayName: 'Новое имя' });
    expect(r.status).toBe(200);
    expect(r.body.user.displayName).toBe('Новое имя');
  });

  it('accepts a small avatar and rejects an oversized one', async () => {
    const u = await registerUser(ctx, 'alice');
    const small = `data:image/png;base64,${'A'.repeat(2000)}`;
    const ok = await u.agent
      .put('/api/profile')
      .set('X-CSRF-Token', u.csrf)
      .send({ avatarBase64: small });
    expect(ok.status).toBe(200);
    expect(ok.body.user.avatarBase64).toBe(small);

    const huge = `data:image/png;base64,${'A'.repeat(300_000)}`;
    const bad = await u.agent
      .put('/api/profile')
      .set('X-CSRF-Token', u.csrf)
      .send({ avatarBase64: huge });
    expect(bad.status).toBe(400);
  });

  it('rejects unauthenticated update', async () => {
    const u = await registerUser(ctx, 'alice');
    await u.agent.post('/api/auth/logout').set('X-CSRF-Token', u.csrf);
    const r = await u.agent
      .put('/api/profile')
      .set('X-CSRF-Token', u.csrf)
      .send({ displayName: 'x' });
    expect(r.status).toBe(401);
  });
});

describe('GET /api/stats/:userId', () => {
  it('returns zeros for a fresh user', async () => {
    const u = await registerUser(ctx, 'alice');
    const r = await u.agent.get(`/api/stats/${u.id}`);
    expect(r.status).toBe(200);
    expect(r.body.stats).toEqual({ wins: 0, losses: 0, draws: 0, gamesPlayed: 0 });
  });
});

describe('friends flow', () => {
  it('request → accept → both see each other as friends', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');

    const reqR = await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: 'bob' });
    expect(reqR.status).toBe(201);
    const friendshipId = reqR.body.friendshipId as number;

    const bobList = await bob.agent.get('/api/friends');
    expect(bobList.body.incoming).toHaveLength(1);
    expect(bobList.body.incoming[0].user.username).toBe('alice');

    const acc = await bob.agent
      .post('/api/friends/accept')
      .set('X-CSRF-Token', bob.csrf)
      .send({ friendshipId });
    expect(acc.status).toBe(200);

    const aliceList = await alice.agent.get('/api/friends');
    expect(aliceList.body.friends).toHaveLength(1);
    expect(aliceList.body.friends[0].user.username).toBe('bob');
    expect(aliceList.body.friends[0].online).toBe(false);
  });

  it('rejects self-request with 400', async () => {
    const alice = await registerUser(ctx, 'alice');
    const r = await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: 'alice' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('self_request');
  });

  it('rejects duplicate request in any direction with 409', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');

    await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: 'bob' });

    const dupSame = await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: 'bob' });
    expect(dupSame.status).toBe(409);

    const dupReverse = await bob.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', bob.csrf)
      .send({ username: 'alice' });
    expect(dupReverse.status).toBe(409);
  });

  it('unknown user → 404; only addressee can accept', async () => {
    const alice = await registerUser(ctx, 'alice');
    await registerUser(ctx, 'bob');

    const missing = await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: 'nobody99' });
    expect(missing.status).toBe(404);

    const reqR = await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: 'bob' });
    // Автор заявки не может сам её принять.
    const selfAccept = await alice.agent
      .post('/api/friends/accept')
      .set('X-CSRF-Token', alice.csrf)
      .send({ friendshipId: reqR.body.friendshipId });
    expect(selfAccept.status).toBe(404);
  });

  it('declined request can be re-sent later', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');

    const first = await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: 'bob' });
    await bob.agent
      .post('/api/friends/decline')
      .set('X-CSRF-Token', bob.csrf)
      .send({ friendshipId: first.body.friendshipId });

    const again = await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: 'bob' });
    expect(again.status).toBe(201);
  });
});
