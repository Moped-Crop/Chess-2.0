/**
 * Интеграционные тесты настроек аккаунта (supertest + pg-mem): смена
 * пароля/логина/почты, 2FA (включение, вход с TOTP и с резервным кодом,
 * отключение), удаление аккаунта (email-путь, TOTP-путь, превышение попыток,
 * сохранность партий).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generate } from 'otplib';
import {
  makeTestApp,
  agentWithCsrf,
  registerUser,
  type TestCtx,
  type TestUser,
} from './testApp';

let ctx: TestCtx;

beforeEach(async () => {
  ctx = await makeTestApp();
});

/** Отдельная свежая залогиненная сессия того же пользователя (другой агент). */
async function loginAgain(username: string) {
  const { agent, csrf } = await agentWithCsrf(ctx.app);
  const r = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .send({ login: username, password: 'password-123' });
  expect(r.status).toBe(200);
  return { agent, csrf };
}

/** Включить 2FA пользователю; вернуть его TOTP-секрет и резервные коды. */
async function enable2fa(u: TestUser): Promise<{ secret: string; backupCodes: string[] }> {
  const setup = await u.agent.post('/api/account/2fa/setup').set('X-CSRF-Token', u.csrf).send({});
  expect(setup.status).toBe(200);
  expect(setup.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  const secret = setup.body.manualEntryKey as string;
  const code = await generate({ secret });
  const confirm = await u.agent
    .post('/api/account/2fa/confirm')
    .set('X-CSRF-Token', u.csrf)
    .send({ code });
  expect(confirm.status).toBe(200);
  expect(confirm.body.backupCodes).toHaveLength(8);
  return { secret, backupCodes: confirm.body.backupCodes as string[] };
}

describe('change-password', () => {
  it('changes password, keeps current device, logs out other sessions', async () => {
    const u = await registerUser(ctx, 'alice');
    const other = await loginAgain('alice');

    const r = await u.agent
      .post('/api/account/change-password')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', newPassword: 'new-password-9' });
    expect(r.status).toBe(200);

    // Инициатор остаётся в системе (свежая cookie).
    expect((await u.agent.get('/api/auth/me')).status).toBe(200);
    // Другая сессия разлогинена по token_version.
    expect((await other.agent.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects a wrong current password', async () => {
    const u = await registerUser(ctx, 'alice');
    const r = await u.agent
      .post('/api/account/change-password')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'nope', newPassword: 'new-password-9' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('wrong_password');
  });
});

describe('change-username', () => {
  it('changes username; rejects wrong password and taken name', async () => {
    const u = await registerUser(ctx, 'alice');
    await registerUser(ctx, 'bob');

    const wrong = await u.agent
      .post('/api/account/change-username')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'nope', newUsername: 'alice2' });
    expect(wrong.status).toBe(401);

    const taken = await u.agent
      .post('/api/account/change-username')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', newUsername: 'bob' });
    expect(taken.status).toBe(409);

    const ok = await u.agent
      .post('/api/account/change-username')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', newUsername: 'alice_new' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.username).toBe('alice_new');
  });
});

describe('change-email', () => {
  it('stages a pending email, old still works, confirm switches it', async () => {
    const u = await registerUser(ctx, 'alice');

    const req = await u.agent
      .post('/api/account/change-email')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', newEmail: 'alice-new@test.dev' });
    expect(req.status).toBe(200);
    expect(ctx.mailer.sent[ctx.mailer.sent.length - 1]).toMatchObject({ type: 'emailChange', to: 'alice-new@test.dev' });

    // Старый адрес всё ещё логинит.
    const oldLogin = await loginAgain('alice@test.dev');
    expect((await oldLogin.agent.get('/api/auth/me')).status).toBe(200);

    // Подтверждаем по токену из письма.
    const token = ctx.mailer.lastToken()!;
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const confirm = await agent
      .post('/api/account/confirm-email-change')
      .set('X-CSRF-Token', csrf)
      .send({ token });
    expect(confirm.status).toBe(200);

    // Теперь логинит новый адрес.
    const newLogin = await agentWithCsrf(ctx.app);
    const r = await newLogin.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', newLogin.csrf)
      .send({ login: 'alice-new@test.dev', password: 'password-123' });
    expect(r.status).toBe(200);
  });

  it('rejects wrong password, taken email, and expired token', async () => {
    const u = await registerUser(ctx, 'alice');
    await registerUser(ctx, 'bob');

    const wrong = await u.agent
      .post('/api/account/change-email')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'nope', newEmail: 'x@test.dev' });
    expect(wrong.status).toBe(401);

    const taken = await u.agent
      .post('/api/account/change-email')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', newEmail: 'bob@test.dev' });
    expect(taken.status).toBe(409);

    await u.agent
      .post('/api/account/change-email')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', newEmail: 'alice-new@test.dev' });
    const token = ctx.mailer.lastToken()!;
    await ctx.pool.query(`UPDATE users SET pending_email_expires = NOW() - interval '1 hour' WHERE username='alice'`);
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const expired = await agent
      .post('/api/account/confirm-email-change')
      .set('X-CSRF-Token', csrf)
      .send({ token });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe('token_expired');
  });
});

describe('2FA', () => {
  it('enables 2FA and requires a TOTP code at login', async () => {
    const u = await registerUser(ctx, 'alice');
    const { secret } = await enable2fa(u);

    // /me теперь показывает totpEnabled.
    expect((await u.agent.get('/api/auth/me')).body.user.totpEnabled).toBe(true);

    // Логин отдаёт challenge, а не сессию.
    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const login = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ login: 'alice', password: 'password-123' });
    expect(login.status).toBe(200);
    expect(login.body.requires2fa).toBe(true);
    expect(String(login.headers['set-cookie'] ?? '')).not.toContain('token=');

    // Верный TOTP-код завершает вход.
    const code = await generate({ secret });
    const verify = await agent
      .post('/api/auth/login/verify-2fa')
      .set('X-CSRF-Token', csrf)
      .send({ challenge: login.body.challenge, code });
    expect(verify.status).toBe(200);
    expect(verify.body.user.username).toBe('alice');
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('logs in with a one-time backup code and marks it used', async () => {
    const u = await registerUser(ctx, 'alice');
    const { backupCodes } = await enable2fa(u);
    const backup = backupCodes[0];

    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const login = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ login: 'alice', password: 'password-123' });
    const challenge = login.body.challenge;

    const ok = await agent
      .post('/api/auth/login/verify-2fa')
      .set('X-CSRF-Token', csrf)
      .send({ challenge, code: backup });
    expect(ok.status).toBe(200);

    // Тот же резервный код второй раз не проходит (помечен used).
    const l2 = await agentWithCsrf(ctx.app);
    const login2res = await l2.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', l2.csrf)
      .send({ login: 'alice', password: 'password-123' });
    const reuse = await l2.agent
      .post('/api/auth/login/verify-2fa')
      .set('X-CSRF-Token', l2.csrf)
      .send({ challenge: login2res.body.challenge, code: backup });
    expect(reuse.status).toBe(401);
  });

  it('rejects a wrong 2FA code and disables 2FA with password + code', async () => {
    const u = await registerUser(ctx, 'alice');
    const { secret } = await enable2fa(u);

    const { agent, csrf } = await agentWithCsrf(ctx.app);
    const login = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ login: 'alice', password: 'password-123' });
    const bad = await agent
      .post('/api/auth/login/verify-2fa')
      .set('X-CSRF-Token', csrf)
      .send({ challenge: login.body.challenge, code: '000000' });
    expect(bad.status).toBe(401);

    // Отключение 2FA.
    const code = await generate({ secret });
    const disable = await u.agent
      .post('/api/account/2fa/disable')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', code });
    expect(disable.status).toBe(200);
    expect((await u.agent.get('/api/auth/me')).body.user.totpEnabled).toBe(false);
  });
});

describe('account deletion', () => {
  it('rejects a wrong password', async () => {
    const u = await registerUser(ctx, 'alice');
    const r = await u.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'nope' });
    expect(r.status).toBe(401);
  });

  it('email path: sends a code, anonymizes on confirm, preserves games', async () => {
    const u = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    // Партия, где участвует alice — не должна сломаться после удаления.
    await ctx.pool.query(
      `INSERT INTO games (white_id, black_id, status, result) VALUES ($1, $2, 'finished', 'white')`,
      [u.id, bob.id],
    );

    const first = await u.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123' });
    expect(first.body).toEqual({ status: 'email_code_sent' });
    const code = ctx.mailer.lastCode()!;
    expect(code).toMatch(/^\d{6}$/);

    const second = await u.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', emailCode: code });
    expect(second.status).toBe(200);

    // Сессия мертва, аккаунт анонимизирован, партия цела.
    expect((await u.agent.get('/api/auth/me')).status).toBe(401);
    const row = await ctx.pool.query('SELECT username, display_name, deleted_at FROM users WHERE id = $1', [u.id]);
    expect(row.rows[0].username).toBe(`deleted_user_${u.id}`);
    expect(row.rows[0].display_name).toBe('Удалённый пользователь');
    expect(row.rows[0].deleted_at).not.toBeNull();
    const games = await ctx.pool.query('SELECT white_id, black_id FROM games');
    expect(games.rows[0]).toMatchObject({ white_id: u.id, black_id: bob.id });
  });

  it('totp path: first call asks for totp, second confirms', async () => {
    const u = await registerUser(ctx, 'alice');
    const { secret } = await enable2fa(u);

    const first = await u.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123' });
    expect(first.body).toEqual({ status: 'totp_required' });

    const code = await generate({ secret });
    const second = await u.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', totpCode: code });
    expect(second.status).toBe(200);
    const row = await ctx.pool.query('SELECT deleted_at FROM users WHERE id = $1', [u.id]);
    expect(row.rows[0].deleted_at).not.toBeNull();
  });

  it('blocks after too many wrong email codes', async () => {
    const u = await registerUser(ctx, 'alice');
    await u.agent.post('/api/account/delete').set('X-CSRF-Token', u.csrf).send({ currentPassword: 'password-123' });

    // 5 неверных попыток.
    for (let i = 0; i < 5; i++) {
      const r = await u.agent
        .post('/api/account/delete')
        .set('X-CSRF-Token', u.csrf)
        .send({ currentPassword: 'password-123', emailCode: '000000' });
      expect(r.status).toBe(401);
    }
    // 6-я — код сгорел.
    const blocked = await u.agent
      .post('/api/account/delete')
      .set('X-CSRF-Token', u.csrf)
      .send({ currentPassword: 'password-123', emailCode: '000000' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('too_many_attempts');
  });
});
