/**
 * Загрузка и проверка переменных окружения (.env через dotenv).
 * Сервер обязан упасть с понятной ошибкой, если чего-то не хватает —
 * это требование безопасности (никаких дефолтных секретов).
 */

import dotenv from 'dotenv';

// Два файла: .env (общие секреты) и .env.server (NODE_ENV — он живёт отдельно,
// потому что Vite особым образом трактует NODE_ENV из .env и ломал бы сборку
// фронтенда). Уже установленные переменные окружения dotenv не перезаписывает —
// на хостинге NODE_ENV=production задаётся платформой и имеет приоритет.
dotenv.config({ path: ['.env', '.env.server'], quiet: true });

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'NODE_ENV'] as const;

export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  NODE_ENV: string;
  PORT: number;
  isProd: boolean;
}

export function loadEnv(): Env {
  const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k]!.trim() === '');
  if (missing.length > 0) {
    // Секреты в лог не выводим — только имена недостающих переменных.
    console.error(
      `Ошибка запуска: отсутствуют обязательные переменные окружения: ${missing.join(', ')}.\n` +
        `Создайте файл .env в корне проекта по образцу .env.example.`,
    );
    process.exit(1);
  }
  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_SECRET: process.env.JWT_SECRET!,
    NODE_ENV: process.env.NODE_ENV!,
    PORT: Number(process.env.PORT ?? 3001),
    isProd: process.env.NODE_ENV === 'production',
  };
}
