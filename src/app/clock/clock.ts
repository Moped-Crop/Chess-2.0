/**
 * Логика шахматных часов — Tech_Plan §9.
 *
 * Часы живут в слое матча (store), НЕ в ядре движка (архитектурное правило №4:
 * ядро детерминировано и не зависит от реального времени). Здесь — чистые
 * функции над ClockState; фактическое списание считается по монотонным часам
 * performance.now(), что устойчиво к фоновым вкладкам и дрейфу.
 *
 * Режимы: 'none' (без часов) и 'fischer' (база + инкремент за ход; инкремент 0 =
 * классический «sudden death»). Делэй и пресеты «по времени партии 10×8» — потом.
 */

import type { Color } from '../../engine/types';

export type ClockMode = 'none' | 'fischer';

export interface TimePreset {
  id: string;
  label: string;
  labelEn: string;
  baseMs: number;
  incrementMs: number;
  mode: ClockMode;
}

export interface ClockState {
  mode: ClockMode;
  whiteMs: number;
  blackMs: number;
  incrementMs: number;
  activeColor: Color | null; // null = часы остановлены (партия окончена)
  lastTickTs: number | null; // performance.now() на момент последнего обновления
}

// Порядок: вариант «без инкремента» идёт рядом со своим «с инкрементом» на
// той же скорости. Единый источник для локального режима (SettingsTab) и
// онлайна (пикер приглашения + zod-enum сервера строятся из этого массива).
export const PRESETS: TimePreset[] = [
  { id: 'none', label: 'Без часов', labelEn: 'No clock', baseMs: 0, incrementMs: 0, mode: 'none' },
  { id: '1+0', label: 'Пуля 1+0', labelEn: 'Bullet 1+0', baseMs: 60_000, incrementMs: 0, mode: 'fischer' },
  { id: '3+0', label: 'Блиц 3+0', labelEn: 'Blitz 3+0', baseMs: 180_000, incrementMs: 0, mode: 'fischer' },
  { id: '3+2', label: 'Блиц 3+2', labelEn: 'Blitz 3+2', baseMs: 180_000, incrementMs: 2_000, mode: 'fischer' },
  { id: '5+0', label: 'Блиц 5+0', labelEn: 'Blitz 5+0', baseMs: 300_000, incrementMs: 0, mode: 'fischer' },
  { id: '5+3', label: 'Блиц 5+3', labelEn: 'Blitz 5+3', baseMs: 300_000, incrementMs: 3_000, mode: 'fischer' },
  { id: '10+0', label: 'Рапид 10+0', labelEn: 'Rapid 10+0', baseMs: 600_000, incrementMs: 0, mode: 'fischer' },
  { id: '10+5', label: 'Рапид 10+5', labelEn: 'Rapid 10+5', baseMs: 600_000, incrementMs: 5_000, mode: 'fischer' },
  { id: '15+0', label: 'Классика 15+0', labelEn: 'Classical 15+0', baseMs: 900_000, incrementMs: 0, mode: 'fischer' },
  { id: '15+10', label: 'Классика 15+10', labelEn: 'Classical 15+10', baseMs: 900_000, incrementMs: 10_000, mode: 'fischer' },
];

export function presetById(id: string): TimePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** Новые часы из пресета. Для 'none' возвращает null (часов нет). */
export function createClock(preset: TimePreset, nowTs: number): ClockState | null {
  if (preset.mode === 'none') return null;
  return {
    mode: preset.mode,
    whiteMs: preset.baseMs,
    blackMs: preset.baseMs,
    incrementMs: preset.incrementMs,
    activeColor: 'white', // часы белых идут с начала партии
    lastTickTs: nowTs,
  };
}

/** Списать прошедшее время у активной стороны (для отрисовки/проверки флага). */
export function applyElapsed(clock: ClockState, nowTs: number): ClockState {
  if (clock.activeColor === null || clock.lastTickTs === null) return clock;
  const elapsed = Math.max(0, nowTs - clock.lastTickTs);
  const whiteMs =
    clock.activeColor === 'white' ? Math.max(0, clock.whiteMs - elapsed) : clock.whiteMs;
  const blackMs =
    clock.activeColor === 'black' ? Math.max(0, clock.blackMs - elapsed) : clock.blackMs;
  return { ...clock, whiteMs, blackMs, lastTickTs: nowTs };
}

/** Какая сторона просрочила время (0 мс), либо null. */
export function flaggedColor(clock: ClockState): Color | null {
  if (clock.whiteMs <= 0) return 'white';
  if (clock.blackMs <= 0) return 'black';
  return null;
}

/**
 * Переключение после хода: списать прошедшее у ходившего, добавить инкремент,
 * передать ход. Если партия окончена — остановить часы (activeColor=null).
 */
export function switchAfterMove(
  clock: ClockState,
  mover: Color,
  nowTs: number,
  gameOver: boolean,
): ClockState {
  const settled = applyElapsed(clock, nowTs);
  const whiteMs = mover === 'white' ? settled.whiteMs + clock.incrementMs : settled.whiteMs;
  const blackMs = mover === 'black' ? settled.blackMs + clock.incrementMs : settled.blackMs;
  const nextActive: Color | null = gameOver ? null : mover === 'white' ? 'black' : 'white';
  return {
    ...settled,
    whiteMs,
    blackMs,
    activeColor: nextActive,
    lastTickTs: nextActive ? nowTs : null,
  };
}

/** Формат времени: m:ss для ≥1 мин, иначе секунды с десятыми (для цейтнота). */
export function formatTime(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe >= 60_000) {
    const totalSec = Math.floor(safe / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return (safe / 1000).toFixed(1);
}
