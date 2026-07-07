/**
 * Точка входа backend: проверка окружения → подключение БД → миграции →
 * Express (REST + статика в проде) + Socket.IO на одном HTTP-сервере.
 *
 * Разработка: `npm run dev:server` (порт 3001, фронт проксирует /api и
 * /socket.io через vite). Прод: `npm start` — один процесс на всё.
 */

import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { loadEnv } from './env';
import { createPool } from './db/pool';
import { runMigrations } from './db/migrate';
import { createApp } from './app';
import { attachGameSockets } from './sockets/game';

const env = loadEnv();
const pool = await createPool(env.DATABASE_URL);

// Миграции применяются на старте (идемпотентно) — партии переживают рестарт.
const applied = await runMigrations(pool);
if (applied.length > 0) console.log(`БД: применены миграции ${applied.join(', ')}`);

const app = createApp({ pool, env });
const httpServer = http.createServer(app);

export const io = new SocketIOServer(httpServer, {
  // В деве фронт ходит через vite-прокси с того же origin; CORS не нужен.
  serveClient: false,
});

attachGameSockets(io, pool, env);

httpServer.listen(env.PORT, () => {
  console.log(`Chess 2 server: http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
