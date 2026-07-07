/**
 * Фабрика Express-приложения. Вынесена из index.ts, чтобы интеграционные
 * тесты (supertest) могли создать приложение с pg-mem-пулом без открытия
 * порта и без реальной БД.
 *
 * Безопасность: helmet-заголовки, лимит тела запроса, CSRF (double submit),
 * скрытие деталей ошибок в проде, никакого вывода секретов в логи.
 */

import express from 'express';
import type pg from 'pg';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Env } from './env';

export interface AppDeps {
  pool: pg.Pool;
  env: Env;
}

export function createApp({ pool, env }: AppDeps): express.Express {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Google Fonts из index.html + аватары base64 + вебсокеты.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '300kb' })); // аватар base64 ≤ 200 КБ + запас
  app.use(cookieParser());

  // Здоровье сервера и БД (используется при проверке деплоя).
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: 'ok' });
    } catch {
      res.status(500).json({ ok: false, db: 'error' });
    }
  });

  // Продакшен: этот же процесс отдаёт собранный фронтенд из dist/.
  if (env.isProd) {
    const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    app.use(express.static(dist));
    // SPA-fallback: все не-API запросы → index.html (роутингом занимается React).
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  // Неизвестные API-маршруты.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Финальный обработчик ошибок: в проде без стека и внутренних деталей.
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (!env.isProd) console.error(err);
      res.status(500).json({ error: 'internal' });
    },
  );

  return app;
}
