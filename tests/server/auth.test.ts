/**
 * Интеграционные тесты авторизации (supertest + pg-mem): обязательное
 * подтверждение почты (register не даёт сессии, login блокируется), verify-email,
 * повторная отправка письма, восстановление пароля, token_version разлогинивает
 * старые сессии, CSRF/валидация/rate limit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { makeTestApp, agentWithCsrf, registerUser, type TestCtx } from './testApp';

let ctx: TestCtx;

beforeEach(async () => {
  ctx = await makeTestApp();
});

/** Зарегистрировать без подтверждения; вернуть агент, csrf и email. */
async function registerRaw(username: string) {
  const { agent, csrf } = await agentWithCsrf(ctx.app);
  const r = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
    username,
    email: `${username}@test.dev`,
    password: 'password-123',
    displayName: username,
  });
  return { agent, csrf, r };
}

describe('POST /api/auth/register', () => {
  it('creates the account WITHOUT a session and sends a verification email', async () => {
    const { r } = await registerRaw('alice');
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ status: 'verify_email_sent', email: 'alice@test.dev' });
    // Никакой сессии не выдано.
    expect(String(r.headers['set-cookie'] ?? '')).not.toContain('token=');
    // Письмо перехвачено.
    expect(ctx.mailer.sent[ctx.mailer.sent.length - 1]).toMatchObject({ type: 'verify', to: 'alice@test.dev' });

    const u = await ctx.pool.query('SELECT email_verified FROM users WHERE username = $1', ['alice']);
    expect(u.rows[0].email_verified).toBe(false);
    const stats = await ctx.pool.query('SELECT * FROM stats WHERE user_id = (SELECT id FROM users WHERE username=$1)', ['alice']);
    expect(stats.rowCount).toBe(1);
  });

  it('rejects duplicate username / email with 409', async () => {
    await registerRaw('alice');
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const dupName = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
      username: 'alice',
      email: 'other@test.dev',
      password: 'password-123',
      displayName: 'Другая',
    });
    expect(dupName.status).toBe(409);
    expect(dupName.body.error).toBe('username_taken');

    const dupEmail = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
      username: 'alice2',
      email: 'alice@test.dev',
      password: 'password-123',
      displayName: 'Другая',
    });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error).toBe('email_taken');
  });

  it('rejects invalid input and missing CSRF', async () => {
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const short = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
      username: 'bob',
      email: 'bob@test.dev',
      password: 'short',
      displayName: 'Боб',
    });
    expect(short.status).toBe(400);

    const noCsrf = await request(ctx.app).post('/api/auth/register').send({
      username: 'bob',
      email: 'bob@test.dev',
      password: 'password-123',
      displayName: 'Боб',
    });
    expect(noCsrf.status).toBe(403);
  });
});

describe('POST /api/auth/verify-email', () => {
  it('verifies with the emailed token and immediately opens a session', async () => {
    const { agent, csrf } = await registerRaw('alice');
    const token = ctx.mailer.lastToken()!;
    const v = await agent.post('/api/auth/verify-email').set('X-CSRF-Token', csrf).send({ token });
    expect(v.status).toBe(200);
    expect(v.body.user.username).toBe('alice');
    expect(String(v.headers['set-cookie'])).toContain('token=');
    // Сессия работает сразу.
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
  });

  it('rejects an invalid or expired token', async () => {
    const { agent, csrf } = await registerRaw('alice');
    const bad = await agent.post('/api/auth/verify-email').set('X-CSRF-Token', csrf).send({ token: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid_token');

    await ctx.pool.query(`UPDATE users SET email_verify_expires = NOW() - interval '1 hour' WHERE username = 'alice'`);
    const token = ctx.mailer.lastToken()!;
    const expired = await agent.post('/api/auth/verify-email').set('X-CSRF-Token', csrf).send({ token });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe('token_expired');
  });
});

describe('POST /api/auth/login', () => {
  it('blocks an unverified account with 403 email_not_verified', async () => {
    await registerRaw('alice');
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const r = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ login: 'alice', password: 'password-123' });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'email_not_verified', email: 'alice@test.dev' });
    expect(String(r.headers['set-cookie'] ?? '')).not.toContain('token=');
  });

  it('logs in a verified user by username and email', async () => {
    await registerUser(ctx, 'alice');
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const byName = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ login: 'alice', password: 'password-123' });
    expect(byName.status).toBe(200);
    expect(byName.body.user.username).toBe('alice');
    const byEmail = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ login: 'alice@test.dev', password: 'password-123' });
    expect(byEmail.status).toBe(200);
  });

  it('rejects wrong password and unknown user with 401', async () => {
    await registerUser(ctx, 'alice');
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const wrong = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ login: 'alice', password: 'nope' });
    expect(wrong.status).toBe(401);
    const unknown = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ login: 'nobody', password: 'password-123' });
    expect(unknown.status).toBe(401);
  });

  it('rate limits after 30 attempts (429)', async () => {
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const r = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ login: '', password: '' });
      last = r.status;
    }
    expect(last).toBe(429);
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('always answers ok, throttles to once per minute, resends after cooldown', async () => {
    const { agent, csrf } = await registerRaw('alice');
    const sentAfterRegister = ctx.mailer.sent.length;

    // Неизвестная почта — тоже ok, ничего не шлём.
    const unknown = await agent.post('/api/auth/resend-verification').set('X-CSRF-Token', csrf).send({ email: 'ghost@test.dev' });
    expect(unknown.body).toEqual({ ok: true });
    expect(ctx.mailer.sent.length).toBe(sentAfterRegister);

    // Сразу после регистрации — cooldown, письмо не уходит.
    await agent.post('/api/auth/resend-verification').set('X-CSRF-Token', csrf).send({ email: 'alice@test.dev' });
    expect(ctx.mailer.sent.length).toBe(sentAfterRegister);

    // Сдвигаем last_sent в прошлое — теперь письмо уходит.
    await ctx.pool.query(`UPDATE users SET email_verify_last_sent_at = NOW() - interval '2 minutes' WHERE username = 'alice'`);
    const again = await agent.post('/api/auth/resend-verification').set('X-CSRF-Token', csrf).send({ email: 'alice@test.dev' });
    expect(again.body).toEqual({ ok: true });
    expect(ctx.mailer.sent.length).toBe(sentAfterRegister + 1);
  });
});

describe('password recovery', () => {
  it('forgot-password always answers ok and emails a reset link when the user exists', async () => {
    await registerUser(ctx, 'alice');
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const unknown = await agent.post('/api/auth/forgot-password').set('X-CSRF-Token', csrf).send({ email: 'ghost@test.dev' });
    expect(unknown.body).toEqual({ ok: true });

    const r = await agent.post('/api/auth/forgot-password').set('X-CSRF-Token', csrf).send({ email: 'alice@test.dev' });
    expect(r.body).toEqual({ ok: true });
    expect(ctx.mailer.sent[ctx.mailer.sent.length - 1]).toMatchObject({ type: 'reset', to: 'alice@test.dev' });
  });

  it('reset-password sets a new password and invalidates old sessions', async () => {
    const alice = await registerUser(ctx, 'alice'); // agent has a live session
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    await agent.post('/api/auth/forgot-password').set('X-CSRF-Token', csrf).send({ email: 'alice@test.dev' });
    const token = ctx.mailer.lastToken()!;

    const reset = await agent.post('/api/auth/reset-password').set('X-CSRF-Token', csrf).send({ token, newPassword: 'brand-new-pass-9' });
    expect(reset.status).toBe(200);

    // Старый пароль больше не работает, новый — работает.
    const oldPw = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ login: 'alice', password: 'password-123' });
    expect(oldPw.status).toBe(401);
    const newPw = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ login: 'alice', password: 'brand-new-pass-9' });
    expect(newPw.status).toBe(200);

    // Ранее выданная сессия (token_version бумпнут) теперь недействительна.
    const me = await alice.agent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('rejects an invalid or expired reset token', async () => {
    await registerUser(ctx, 'alice');
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const bad = await agent.post('/api/auth/reset-password').set('X-CSRF-Token', csrf).send({ token: 'nope', newPassword: 'whatever-123' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid_token');

    await agent.post('/api/auth/forgot-password').set('X-CSRF-Token', csrf).send({ email: 'alice@test.dev' });
    const token = ctx.mailer.lastToken()!;
    await ctx.pool.query(`UPDATE users SET password_reset_expires = NOW() - interval '1 hour' WHERE username = 'alice'`);
    const expired = await agent.post('/api/auth/reset-password').set('X-CSRF-Token', csrf).send({ token, newPassword: 'whatever-123' });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe('token_expired');
  });
});

describe('GET /api/auth/me + logout', () => {
  it('returns 401 without a session, the user with one, and 401 after logout', async () => {
    expect((await request(ctx.app).get('/api/auth/me')).status).toBe(401);
    const u = await registerUser(ctx, 'alice');
    const me = await u.agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('alice');
    expect(me.body.user.totpEnabled).toBe(false);
    await u.agent.post('/api/auth/logout').set('X-CSRF-Token', u.csrf).expect(200);
    expect((await u.agent.get('/api/auth/me')).status).toBe(401);
  });
});
