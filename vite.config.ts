/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Конфиг сборщика Vite + тест-раннера Vitest.
// Тесты ядра (engine/) — окружение 'node' (без браузера, быстрее).
export default defineConfig({
  plugins: [react()],
  server: { host: true },
  test: {
    globals: true,
    environment: 'node', // компонентные тесты переключаются на jsdom прагмой в файле
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
  },
});
