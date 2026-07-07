/**
 * Интеграционные тесты авторизации (supertest + pg-mem): регистрация, логин,
 * неверный пароль, JWT middleware (/me), CSRF, валидация, rate limit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { makeTestApp, agentWithCsrf, registerUser, type TestCtx } from './testApp';

let ctx: TestCtx;

beforeEach(async () => {
  ctx = await makeTestApp();
});

describe('POST /api/auth/register', () => {
  it('creates a user, sets auth cookie and stats row', async () => {
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const r = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
      username: 'alice',
      email: 'alice@test.dev',
      password: 'password-123',
      displayName: 'Алиса',
    });
    expect(r.status).toBe(201);
    expect(r.body.user.username).toBe('alice');
    expect(String(r.headers['set-cookie'])).toContain('token=');

    const stats = await ctx.pool.query('SELECT * FROM stats WHERE user_id = $1', [r.body.user.id]);
    expect(stats.rowCount).toBe(1);
  });

  it('rejects duplicate username with 409', async () => {
    await registerUser(ctx.app, 'alice');
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const r = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
      username: 'alice',
      email: 'other@test.dev',
      password: 'password-123',
      displayName: 'Другая',
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('username_taken');
  });

  it('rejects invalid input with 400 (short password, bad username)', async () => {
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const short = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
      username: 'bob',
      email: 'bob@test.dev',
      password: 'short',
      displayName: 'Боб',
    });
    expect(short.status).toBe(400);

    const badName = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
      username: 'плохое имя!',
      email: 'bob@test.dev',
      password: 'password-123',
      displayName: 'Боб',
    });
    expect(badName.status).toBe(400);
  });

  it('rejects mutating request without CSRF token (403)', async () => {
    const r = await request(ctx.app).post('/api/auth/register').send({
      username: 'bob',
      email: 'bob@test.dev',
      password: 'password-123',
      displayName: 'Боб',
    });
    expect(r.status).toBe(403);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in by username and by email', async () => {
    await registerUser(ctx.app, 'alice');
    const { agent, csrf } = await agentWithCsrf(ctx.app);

    const byName = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ login: 'alice', password: 'password-123' });
    expect(byName.status).toBe(200);

    const byEmail = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ login: 'alice@test.dev', password: 'password-123' });
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.user.username).toBe('alice');
  });

  it('rejects wrong password and unknown user with 401', async () => {
    await registerUser(ctx.app, 'alice');
    const { agent, csrf } = await agentWithCsrf(ctx.app);

    const wrong = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ login: 'alice', password: 'wrong-password' });
    expect(wrong.status).toBe(401);

    const unknown = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ login: 'nobody', password: 'password-123' });
    expect(unknown.status).toBe(401);
  });

  it('rate limits after 30 attempts (429)', async () => {
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const r = await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', csrf)
        .send({ login: '', password: '' }); // 400 — но лимитер считает запросы
      last = r.status;
    }
    expect(last).toBe(429);
  });
});

describe('GET /api/auth/me + logout', () => {
  it('returns 401 without a session', async () => {
    const r = await request(ctx.app).get('/api/auth/me');
    expect(r.status).toBe(401);
  });

  it('returns the user with a session and 401 after logout', async () => {
    const u = await registerUser(ctx.app, 'alice');

    const me = await u.agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('alice');

    await u.agent.post('/api/auth/logout').set('X-CSRF-Token', u.csrf).expect(200);
    const after = await u.agent.get('/api/auth/me');
    expect(after.status).toBe(401);
  });
});
