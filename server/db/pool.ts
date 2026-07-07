/**
 * Подключение к PostgreSQL.
 *
 * Два режима по DATABASE_URL:
 *  - обычный URL → настоящий pg.Pool (Railway/локальный Postgres);
 *  - "memory://" → встроенная БД pg-mem в памяти процесса. Один и тот же
 *    серверный код работает в проде, в интеграционных тестах и в E2E —
 *    боевая база тестами не затрагивается.
 *
 * SSL: включается параметром DATABASE_SSL=1 (некоторые хостинги требуют TLS).
 */

import pg from 'pg';

export async function createPool(databaseUrl: string): Promise<pg.Pool> {
  if (databaseUrl.startsWith('memory')) {
    const { newDb } = await import('pg-mem');
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    return new Pool() as unknown as pg.Pool;
  }
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
  });
}
