/**
 * Геометрия доски 10×8 (mailbox) и координаты — Rules_Clarification B8.
 *
 * Индекс клетки: s = rank*10 + file. a1 = 0, j1 = 9, a8 = 70, j8 = 79.
 * Белые внизу (домашний ранг 0). КЛЮЧЕВОЕ правило B8: любая проверка «на доске»
 * и любой шаг считаются через (file, rank), НИКОГДА по сырому индексу — иначе
 * фигура «перепрыгнет» через край доски (с j-файла на a-файл соседнего ранга).
 */

import type { Color, Square } from './types';

export const FILE_COUNT = 10;
export const RANK_COUNT = 8;
export const BOARD_SIZE = FILE_COUNT * RANK_COUNT; // 80

/** Файл (столбец) клетки: 0..9. */
export function fileOf(s: Square): number {
  return s % FILE_COUNT;
}

/** Ранг (строка) клетки: 0..7. */
export function rankOf(s: Square): number {
  return Math.floor(s / FILE_COUNT);
}

/** Собрать индекс клетки из файла и ранга. */
export function sq(file: number, rank: number): Square {
  return rank * FILE_COUNT + file;
}

/** Лежит ли (file, rank) на доске. */
export function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < FILE_COUNT && rank >= 0 && rank < RANK_COUNT;
}

/**
 * Шаг от клетки s на смещение (df, dr). Возвращает индекс целевой клетки или
 * null, если шаг уводит за край доски. Это базовый примитив для слайдеров и
 * прыжков — он защищает от перехода через край (B8).
 */
export function offset(s: Square, df: number, dr: number): Square | null {
  const f = fileOf(s) + df;
  const r = rankOf(s) + dr;
  return onBoard(f, r) ? sq(f, r) : null;
}

/** Направление «вперёд» по цвету (B8): белые +1, чёрные −1. */
export function forwardDir(color: Color): 1 | -1 {
  return color === 'white' ? 1 : -1;
}

/** Противоположный цвет. */
export function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

/** Последний ранг для превращения пешки (B8): белые ранг 7, чёрные ранг 0. */
export function isLastRank(s: Square, color: Color): boolean {
  return color === 'white' ? rankOf(s) === RANK_COUNT - 1 : rankOf(s) === 0;
}

const FILE_LETTERS = 'abcdefghij';

/** Имя клетки в алгебраической нотации: 0 -> 'a1', 79 -> 'j8'. */
export function squareName(s: Square): string {
  return FILE_LETTERS[fileOf(s)] + String(rankOf(s) + 1);
}

/** Разбор имени клетки ('a1'..'j8') в индекс 0..79. Бросает при некорректном имени. */
export function squareFromName(name: string): Square {
  const file = FILE_LETTERS.indexOf(name[0]?.toLowerCase() ?? '');
  const rank = Number(name.slice(1)) - 1;
  if (file < 0 || !Number.isInteger(rank) || !onBoard(file, rank)) {
    throw new Error(`Invalid square name: ${name}`);
  }
  return sq(file, rank);
}
