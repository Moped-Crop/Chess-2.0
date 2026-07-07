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

export const TEST_ENV: Env = {
  DATABASE_URL: 'memory://',
  JWT_SECRET: 'test-secret-not-for-production-0123456789',
  NODE_ENV: 'test',
  PORT: 0,
  isProd: false,
};

export interface TestCtx {
  app: express.Express;
  pool: pg.Pool;
}

export async function makeTestApp(): Promise<TestCtx> {
  const pool = await createPool('memory://');
  await runMigrations(pool);
  return { app: createApp({ pool, env: TEST_ENV }), pool };
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

/** Зарегистрировать пользователя и вернуть авторизованный агент. */
export async function registerUser(app: express.Express, username: string): Promise<TestUser> {
  const { agent, csrf } = await agentWithCsrf(app);
  const r = await agent
    .post('/api/auth/register')
    .set('X-CSRF-Token', csrf)
    .send({
      username,
      email: `${username}@test.dev`,
      password: 'password-123',
      displayName: username,
    });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { agent, csrf, id: r.body.user.id as number, username };
}
