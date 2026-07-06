/**
 * Сохранение/чтение партии. Автосейв — в localStorage (Pre-Code Audit §4).
 * Экспорт/импорт — те же данные строкой JSON для файла (§7).
 * Формат версионируется; несовместимые старые сейвы читаются как «только позиция».
 */

import type { GameState, Piece } from '../../engine/types';
import { BOARD_SIZE } from '../../engine/board';
import type { MoveEntry } from '../notation';

const KEY = 'ascent.autosave';
const VERSION = 2;

export interface SavedMatch {
  game: GameState;
  moveLog: MoveEntry[];
  captures: (Piece | null)[];
}

function looksLikeGameState(g: unknown): g is GameState {
  return (
    typeof g === 'object' &&
    g !== null &&
    Array.isArray((g as GameState).board) &&
    (g as GameState).board.length === BOARD_SIZE &&
    typeof (g as GameState).turn === 'string'
  );
}

/** Привести произвольный разобранный JSON к SavedMatch, либо null. */
function coerceMatch(parsed: unknown): SavedMatch | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as {
    version?: number;
    game?: unknown;
    moveLog?: unknown;
    captures?: unknown;
  };
  if (obj.version === VERSION && looksLikeGameState(obj.game)) {
    return {
      game: obj.game,
      moveLog: Array.isArray(obj.moveLog) ? (obj.moveLog as MoveEntry[]) : [],
      captures: Array.isArray(obj.captures) ? (obj.captures as (Piece | null)[]) : [],
    };
  }
  // Несовместимый/старый формат: восстанавливаем только позицию.
  if (looksLikeGameState(parsed)) {
    return { game: parsed, moveLog: [], captures: [] };
  }
  if (looksLikeGameState(obj.game)) {
    return { game: obj.game, moveLog: [], captures: [] };
  }
  return null;
}

/** Строка JSON для экспорта в файл. */
export function serializeMatch(
  game: GameState,
  moveLog: MoveEntry[],
  captures: (Piece | null)[],
): string {
  return JSON.stringify({ version: VERSION, game, moveLog, captures }, null, 2);
}

/** Разбор строки JSON (импорт файла). null, если формат не распознан. */
export function parseMatch(text: string): SavedMatch | null {
  try {
    return coerceMatch(JSON.parse(text));
  } catch {
    return null;
  }
}

export function saveGame(game: GameState, moveLog: MoveEntry[], captures: (Piece | null)[]): void {
  try {
    localStorage.setItem(KEY, serializeMatch(game, moveLog, captures));
  } catch {
    /* приватный режим / переполнение — молча игнорируем */
  }
}

export function loadGame(): SavedMatch | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? coerceMatch(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* игнорируем */
  }
}

// --- UI-настройки (тема, ориентация, звук) — отдельный ключ, переживают сессию ---

const SETTINGS_KEY = 'ascent.settings';

export interface Settings {
  orientation: string;
  themeId: string;
  uiTheme?: string;
  muted: boolean;
  volume?: number;
  lang: string;
}

export function loadSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
  } catch {
    return {};
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* игнорируем */
  }
}
