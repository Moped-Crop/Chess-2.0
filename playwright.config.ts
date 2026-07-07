/**
 * E2E-конфигурация: Playwright сам поднимает backend (in-memory БД — боевая
 * база не затрагивается) и vite на отдельных портах, чтобы не конфликтовать
 * с dev-серверами. Запуск: npm run test:e2e
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5273',
  },
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      port: 3101,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: 'memory://',
        JWT_SECRET: 'e2e-secret-not-for-production-0123456789',
        NODE_ENV: 'test',
        PORT: '3101',
      },
    },
    {
      command: 'npx vite --port 5273 --strictPort',
      port: 5273,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PORT: '3101' },
    },
  ],
});
