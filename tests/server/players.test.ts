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
