/**
 * Хелперы интеграционных тестов: приложение с pg-mem-пулом (боевая БД не
 * затрагивается) + supertest-агент с cookie и CSRF-токеном.
 */

import type pg from 'pg';
import type express from 'express';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { createPool } from '../../server/db/pool';
import { runMigrations } from '../../server/db/migrate';
import { createApp } from '../../server/app';
import type { Env } from '../../server/env';
import type { Mailer, Lang } from '../../server/lib/mailer';

export const TEST_ENV: Env = {
  DATABASE_URL: 'memory://',
  JWT_SECRET: 'test-secret-not-for-production-0123456789',
  NODE_ENV: 'test',
  PORT: 0,
  isProd: false,
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: 465,
  SMTP_USER: 'test@example.test',
  SMTP_PASS: 'test-app-password',
  SMTP_FROM: '"Chess 2 · ASCENT" <test@example.test>',
  APP_URL: 'http://localhost:5173',
  // 32 байта в hex — валидный ключ для AES-256-GCM в тестах.
  TOTP_ENCRYPTION_KEY: '0'.repeat(64),
};

/** Записывающий фейк почтовика: перехватывает ссылки/коды писем для тестов. */
export interface RecordingMailer extends Mailer {
  sent: Array<{ type: string; to: string; lang: Lang; link?: string; code?: string }>;
  lastLink(): string | undefined;
  lastCode(): string | undefined;
  /** Токен из последней ссылки-письма (?token=...). */
  lastToken(): string | undefined;
}

export function makeRecordingMailer(): RecordingMailer {
  const sent: RecordingMailer['sent'] = [];
  const record =
    (type: string) =>
    (to: string, lang: Lang, linkOrCode: string): Promise<boolean> => {
      const isCode = type === 'delete';
      sent.push({
        type,
        to,
        lang,
        link: isCode ? undefined : linkOrCode,
        code: isCode ? linkOrCode : undefined,
      });
      return Promise.resolve(true);
    };
  return {
    sent,
    sendMail: () => Promise.resolve(true),
    sendVerificationEmail: record('verify'),
    sendPasswordResetEmail: record('reset'),
    sendEmailChangeConfirmation: record('emailChange'),
    sendAccountDeleteCode: record('delete'),
    lastLink: () => sent[sent.length - 1]?.link,
    lastCode: () => sent[sent.length - 1]?.code,
    lastToken: () => {
      const link = sent[sent.length - 1]?.link;
      if (!link) return undefined;
      return new URL(link).searchParams.get('token') ?? undefined;
    },
  };
}

export interface TestCtx {
  app: express.Express;
  pool: pg.Pool;
  mailer: RecordingMailer;
}

export async function makeTestApp(): Promise<TestCtx> {
  const pool = await createPool('memory://');
  await runMigrations(pool);
  const mailer = makeRecordingMailer();
  return { app: createApp({ pool, env: TEST_ENV, mailer }), pool, mailer };
}

export type Agent = InstanceType<typeof TestAgent>;

/** Агент с полученным CSRF-токеном; токен возвращается для заголовков. */
export async function agentWithCsrf(app: express.Express): Promise<{ agent: Agent; csrf: string }> {
  const agent = request.agent(app);
  const r = await agent.get('/api/csrf');
  return { agent, csrf: r.body.csrfToken as string };
}

export interface TestUser {
  agent: Agent;
  csrf: string;
  id: number;
  username: string;
}

/**
 * Зарегистрировать пользователя и вернуть авторизованный агент. Так как
 * регистрация больше НЕ создаёт сессию (нужно подтверждение почты), хелпер
 * проходит и подтверждение: берёт токен из перехваченного письма и вызывает
 * verify-email — тот сразу ставит cookie сессии.
 */
export async function registerUser(ctx: TestCtx, username: string): Promise<TestUser> {
  const { agent, csrf } = await agentWithCsrf(ctx.app);
  const reg = await agent
    .post('/api/auth/register')
    .set('X-CSRF-Token', csrf)
    .send({
      username,
      email: `${username}@test.dev`,
      password: 'password-123',
      displayName: username,
    });
  if (reg.status !== 201) {
    throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  }
  const token = ctx.mailer.lastToken();
  if (!token) throw new Error('no verification token captured');
  const verify = await agent.post('/api/auth/verify-email').set('X-CSRF-Token', csrf).send({ token });
  if (verify.status !== 200) {
    throw new Error(`verify failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  }
  return { agent, csrf, id: verify.body.user.id as number, username };
}
