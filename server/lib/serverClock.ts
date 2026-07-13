/**
 * Серверные шахматные часы поверх строки games. Сама математика часов НЕ
 * дублируется — переиспользуются чистые функции из src/app/clock/clock.ts
 * (тот же приём, каким server/gameEngine.ts импортирует движок из src/engine:
 * одна реализация правил на клиент и сервер).
 *
 * ВАЖНО про источник времени: на клиенте ClockState.lastTickTs — это
 * performance.now() (монотонные часы одного процесса), на сервере — ВСЕГДА
 * Date.now() (мс с эпохи Unix): только такое значение переживает перезапуск
 * сервера, потому что согласуется с TIMESTAMP-колонкой turn_started_at.
 * Чистым функциям безразличен источник — важно лишь не смешивать их в рамках
 * одного ClockState.
 */

import type { Color } from '../../src/engine/types';
import { presetById, applyElapsed, flaggedColor, type ClockState } from '../../src/app/clock/clock';

/** Колонки games, нужные часам (подмножество GameRow из sockets/game.ts). */
export interface ClockRowFields {
  status: string;
  time_control_id: string | null;
  white_ms: number | null;
  black_ms: number | null;
  turn_started_at: Date | string | null;
}

/** turn_started_at из pg приходит Date, из pg-mem может прийти строкой. */
function tsOf(row: ClockRowFields): number | null {
  if (row.turn_started_at == null) return null;
  const d = row.turn_started_at instanceof Date ? row.turn_started_at : new Date(row.turn_started_at);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Собрать ClockState из строки games. activeColor передаётся отдельно —
 * сервер сам знает, чей сейчас ход (reconstructState(row.moves).turn).
 * null — партия без часов (time_control_id пустой или 'none').
 */
export function clockFromRow(row: ClockRowFields, activeColor: Color | null): ClockState | null {
  if (!row.time_control_id || row.time_control_id === 'none') return null;
  const preset = presetById(row.time_control_id);
  if (preset.mode === 'none') return null;
  // Часы идут, только пока партия активна и известно начало текущего хода.
  const startedAt = tsOf(row);
  const running = row.status === 'active' && startedAt !== null ? activeColor : null;
  return {
    mode: preset.mode,
    whiteMs: row.white_ms ?? preset.baseMs,
    blackMs: row.black_ms ?? preset.baseMs,
    incrementMs: preset.incrementMs,
    activeColor: running,
    lastTickTs: running !== null ? startedAt : null,
  };
}

/** Текущий снэпшот (с учётом прошедшего времени) — для отправки клиенту. */
export function liveSnapshot(row: ClockRowFields, activeColor: Color | null): ClockState | null {
  const clock = clockFromRow(row, activeColor);
  if (!clock || clock.activeColor === null) return clock;
  return applyElapsed(clock, Date.now());
}

/** Кто просрочил время прямо сейчас, если партия с часами и ещё активна. */
export function checkFlagged(row: ClockRowFields, activeColor: Color | null): Color | null {
  if (row.status !== 'active') return null;
  const clock = liveSnapshot(row, activeColor);
  if (!clock) return null;
  return flaggedColor(clock);
}
