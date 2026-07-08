/**
 * Подключение к PostgreSQL.
 *
 * Два режима по DATABASE_URL:
 *  - обычный URL → настоящий pg.Pool (Railway/локальный Postgres);
 *  - "memory://" → встроенная БД pg-mem в памяти процесса. Один и тот же
 *    серверный код работает в проде, в интеграционных тестах и в E2E —
 *    боевая база тестами не затрагивается.
 *
 * SSL включается, если:
 *  - DATABASE_SSL=1 (или true), либо
 *  - в строке подключения есть sslmode=require.
 * На Railway внутренний адрес (*.railway.internal) работает без TLS — поэтому
 * по умолчанию SSL выключен и не ломает уже работающую конфигурацию.
 */

import pg from 'pg';

function wantsSsl(databaseUrl: string): boolean {
  const flag = (process.env.DATABASE_SSL ?? '').toLowerCase();
  if (flag === '1' || flag === 'true') return true;
  return /[?&]sslmode=require/i.test(databaseUrl);
}

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
    // Управляемый Postgres обычно с самоподписанным сертификатом.
    ssl: wantsSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });
}
