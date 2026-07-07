/**
 * БД: миграции (первый и повторный запуск), внешние ключи, уникальные
 * ограничения. Всё на pg-mem — боевая база не затрагивается.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type pg from 'pg';
import { createPool } from '../../server/db/pool';
import { runMigrations } from '../../server/db/migrate';

let pool: pg.Pool;

beforeEach(async () => {
  pool = await createPool('memory://test');
  await runMigrations(pool);
});

describe('migrations', () => {
  it('applies 001_init on a fresh database', async () => {
    const r = await pool.query('SELECT id FROM schema_migrations ORDER BY id');
    expect(r.rows.map((x) => x.id)).toContain('001_init.sql');
  });

  it('is idempotent: second run applies nothing', async () => {
    const again = await runMigrations(pool);
    expect(again).toEqual([]);
  });
});

describe('schema constraints', () => {
  async function makeUser(username: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users (username, display_name, email, password_hash)
       VALUES ($1, $2, $3, 'hash') RETURNING id`,
      [username, username, `${username}@test.dev`],
    );
    return r.rows[0].id as number;
  }

  it('enforces unique username and email', async () => {
    await makeUser('alice');
    await expect(makeUser('alice')).rejects.toThrow();
  });

  it('enforces unique friendship pair', async () => {
    const a = await makeUser('alice');
    const b = await makeUser('bob');
    await pool.query('INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)', [a, b]);
    await expect(
      pool.query('INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)', [a, b]),
    ).rejects.toThrow();
  });

  it('cascades stats deletion with the user (foreign key)', async () => {
    const a = await makeUser('alice');
    await pool.query('INSERT INTO stats (user_id) VALUES ($1)', [a]);
    await pool.query('DELETE FROM users WHERE id = $1', [a]);
    const r = await pool.query('SELECT * FROM stats WHERE user_id = $1', [a]);
    expect(r.rowCount).toBe(0);
  });

  it('rejects friendship with unknown user (foreign key)', async () => {
    const a = await makeUser('alice');
    await expect(
      pool.query('INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)', [a, 9999]),
    ).rejects.toThrow();
  });
});
