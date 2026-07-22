/**
 * Ручка аватарок и «похудевшие» списочные ответы (supertest + pg-mem).
 *
 * Проверяем:
 *  - /api/avatars/:id отдаёт бинарь с Content-Type/ETag и умеет 304;
 *  - у пользователя без аватара — 404 (клиент покажет инициалы);
 *  - /api/leaderboard больше НЕ вкладывает avatar_base64 и весит килобайты,
 *    даже когда у игрока аватар почти предельного размера (~200 КБ).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestApp, registerUser, type TestCtx } from './testApp';

let ctx: TestCtx;

beforeEach(async () => {
  ctx = await makeTestApp();
});

/** Валидный data-URL с крупным (но допустимым) base64-телом. */
function bigAvatar(): string {
  // 260 000 символов base64 ≈ ~195 КБ бинаря (лимит сервера — 280 000).
  return 'data:image/png;base64,' + 'A'.repeat(260_000);
}

/** Проставляем рейтинговые партии напрямую — чтобы игрок попал в лидерборд. */
async function makeRanked(ctx: TestCtx, userId: number, rating: number) {
  await ctx.pool.query(
    'UPDATE stats SET rating = $2, ranked_games_played = 5, ranked_wins = 3 WHERE user_id = $1',
    [userId, rating],
  );
}

describe('GET /api/avatars/:id', () => {
  it('serves the avatar as binary with caching headers and honours If-None-Match', async () => {
    const alice = await registerUser(ctx, 'alice');
    await alice.agent
      .put('/api/profile')
      .set('X-CSRF-Token', alice.csrf)
      .send({ avatarBase64: bigAvatar() });

    const r = await alice.agent.get(`/api/avatars/${alice.id}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^image\/png/);
    expect(r.headers['cache-control']).toContain('max-age=86400');
    const etag = r.headers['etag'];
    expect(etag).toBeTruthy();
    // Бинарь на треть меньше base64-строки.
    expect(Number(r.headers['content-length'])).toBeLessThan(260_000 * 0.8);

    // Повторный запрос с тем же ETag — 304 без тела.
    const cached = await alice.agent
      .get(`/api/avatars/${alice.id}`)
      .set('If-None-Match', etag);
    expect(cached.status).toBe(304);
  });

  it('returns 404 when the user has no avatar', async () => {
    const alice = await registerUser(ctx, 'alice');
    const r = await alice.agent.get(`/api/avatars/${alice.id}`);
    expect(r.status).toBe(404);
  });

  it('requires authentication', async () => {
    const alice = await registerUser(ctx, 'alice');
    const noSession = (await import('supertest')).default(ctx.app);
    const r = await noSession.get(`/api/avatars/${alice.id}`);
    expect(r.status).toBe(401);
  });
});

describe('GET /api/leaderboard payload size', () => {
  it('carries userId (not avatar_base64) and stays tiny despite a huge avatar', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    await bob.agent
      .put('/api/profile')
      .set('X-CSRF-Token', bob.csrf)
      .send({ avatarBase64: bigAvatar() });
    await makeRanked(ctx, alice.id, 1300);
    await makeRanked(ctx, bob.id, 1200);

    const r = await alice.agent.get('/api/leaderboard');
    expect(r.status).toBe(200);
    expect(r.body.entries).toHaveLength(2);

    const raw = JSON.stringify(r.body);
    // Ни следа аватара; каждая строка несёт userId.
    expect(raw).not.toContain('avatarBase64');
    expect(raw).not.toContain('AAAAAAAA');
    expect(r.body.entries[0].userId).toBe(alice.id);
    // Раньше одна строка тащила ~200 КБ base64 (25 строк ≈ мегабайты);
    // теперь весь ответ — считанные килобайты.
    expect(raw.length).toBeLessThan(4_000);
  });
});
