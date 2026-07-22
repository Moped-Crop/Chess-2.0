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
import { issueCsrfToken, requireCsrf } from './middleware/csrf';
import { authRouter } from './routes/auth';
import { profileRouter } from './routes/profile';
import { friendsRouter } from './routes/friends';
import { playersRouter } from './routes/players';
import { accountRouter } from './routes/account';
import { gamesRouter } from './routes/games';
import { chatRouter } from './routes/chat';
import { leaderboardRouter } from './routes/leaderboard';
import { avatarsRouter } from './routes/avatars';
import { createMailer, type Mailer } from './lib/mailer';

export interface AppDeps {
  pool: pg.Pool;
  env: Env;
  /** Инъекция почтовика: в тестах подставляется записывающий фейк. */
  mailer?: Mailer;
}

export function createApp({ pool, env, mailer }: AppDeps): express.Express {
  const app = express();
  // За прокси Railway реальный IP клиента приходит в X-Forwarded-For. Доверяем
  // первому хопу (сам прокси) — иначе express-rate-limit не может корректно
  // определить клиента и бросает ошибку. Только первый хоп (не true), чтобы
  // клиент не мог подделать свой IP через заголовок.
  app.set('trust proxy', 1);
  const mail = mailer ?? createMailer(env);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Google Fonts из index.html + аватары base64 + вебсокеты.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          // blob: — обрезка аватарки читает выбранный пользователем файл через
          // URL.createObjectURL; такие ссылки всегда локальные, внешнее через
          // них не загрузить. Без blob: загрузка аватарки блокировалась CSP
          // для ЛЮБОГО формата файла.
          imgSrc: ["'self'", 'data:', 'blob:'],
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

  // CSRF: выдача токена + проверка на всех изменяющих запросах к API.
  app.get('/api/csrf', (req, res) => issueCsrfToken(req, res, env.isProd));
  app.use('/api', requireCsrf);

  app.use('/api/auth', authRouter(pool, env, mail));
  app.use('/api', profileRouter(pool, env));
  app.use('/api/friends', friendsRouter(pool, env));
  app.use('/api/players', playersRouter(pool, env));
  app.use('/api/account', accountRouter(pool, env, mail));
  app.use('/api/games', gamesRouter(pool, env));
  app.use('/api/chat', chatRouter(pool, env));
  app.use('/api/leaderboard', leaderboardRouter(pool, env));
  app.use('/api/avatars', avatarsRouter(pool, env));

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
