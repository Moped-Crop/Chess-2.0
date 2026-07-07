/**
 * Мини-раннер миграций: пронумерованные .sql-файлы из migrations/ применяются
 * по порядку, каждая — в транзакции; применённые запоминаются в
 * schema_migrations. Повторный запуск безопасен (идемпотентен).
 *
 * Запуск вручную: npm run migrate. Также вызывается при старте сервера.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type pg from 'pg';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function runMigrations(pool: pg.Pool): Promise<string[]> {
  // Явная проверка вместо CREATE TABLE IF NOT EXISTS: одинаково работает и в
  // настоящем Postgres, и в pg-mem (у которого IF NOT EXISTS ограничен).
  const has = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'`,
  );
  if ((has.rowCount ?? 0) === 0) {
    await pool.query(
      `CREATE TABLE schema_migrations (
         id TEXT PRIMARY KEY,
         applied_at TIMESTAMP DEFAULT NOW()
       )`,
    );
  }

  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
    if ((done.rowCount ?? 0) > 0) continue;

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  return applied;
}

// CLI: tsx server/db/migrate.ts
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { loadEnv } = await import('../env');
  const { createPool } = await import('./pool');
  const env = loadEnv();
  const pool = await createPool(env.DATABASE_URL);
  try {
    const applied = await runMigrations(pool);
    console.log(
      applied.length > 0
        ? `Применены миграции: ${applied.join(', ')}`
        : 'Все миграции уже применены.',
    );
  } finally {
    await pool.end();
  }
}
