/**
 * Атакующие множества по типам фигур — Rules_Clarification B2/B3.
 *
 * «Атаки» фигуры = клетки, которые она держит под боем (для детекции шаха и
 * контроля полей). Для большинства фигур это совпадает с клетками их ходов;
 * исключения по B2 — Опора (R_ANCHOR: диагональный шаг НЕ атакует) и Петух/Феникс.
 *
 * Базовые примитивы:
 *  - LEAPER(offsets): прыжок на фикс. смещения; промежуточные клетки игнорируются.
 *  - SLIDER(dirs):    луч по направлению до первой занятой клетки включительно.
 * Вся геометрия идёт через offset() (проверка края по file/rank, B8).
 */

import type { Color, Piece, Square } from './types';
import { offset, forwardDir } from './board';

/** Смещение (df, dr): df — изменение файла, dr — изменение ранга. */
export type Offset = readonly [number, number];

// --- Наборы смещений (B2) ---
export const KNIGHT: readonly Offset[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
export const WAZIR: readonly Offset[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const FERZ: readonly Offset[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
export const ALFIL: readonly Offset[] = [
  [2, 2],
  [2, -2],
  [-2, 2],
  [-2, -2],
];
export const DABBABA: readonly Offset[] = [
  [2, 0],
  [-2, 0],
  [0, 2],
  [0, -2],
];

/** Направления слайдеров. */
export const ORTHOGONALS: readonly Offset[] = WAZIR;
export const DIAGONALS: readonly Offset[] = FERZ;
/** Все 8 соседних клеток — шаги Короля и направления Ферзя. */
export const KING_STEPS: readonly Offset[] = [...WAZIR, ...FERZ];
export const QUEEN_DIRS: readonly Offset[] = [...ORTHOGONALS, ...DIAGONALS];

/**
 * Убрать дубликаты клеток. Нужно составным формам (слайдер + прыжок): например,
 * Ревнитель при чистой диагонали достигает клетки (±2,±2) и лучом, и прыжком —
 * без дедупликации UI получает два одинаковых хода и открывает ложное меню выбора.
 */
export function uniqueSquares(squares: Square[]): Square[] {
  return [...new Set(squares)];
}

/** LEAPER: целевые клетки прыжков на доске (занятость не важна). */
export function leaperTargets(from: Square, offsets: readonly Offset[]): Square[] {
  const out: Square[] = [];
  for (const [df, dr] of offsets) {
    const t = offset(from, df, dr);
    if (t !== null) out.push(t);
  }
  return out;
}

/** SLIDER: лучи по направлениям до первой занятой клетки включительно. */
export function sliderTargets(
  from: Square,
  dirs: readonly Offset[],
  board: (Piece | null)[],
): Square[] {
  const out: Square[] = [];
  for (const [df, dr] of dirs) {
    let t = offset(from, df, dr);
    while (t !== null) {
      out.push(t);
      if (board[t] !== null) break; // первая занятая клетка под боем, дальше стоп
      t = offset(t, df, dr);
    }
  }
  return out;
}

/**
 * Атаки Петуха (B3): forward-луч до первой занятой включительно + 2 диагонали-
 * вперёд на 1. Бок и назад НЕ атакуют. «Вперёд» — по цвету владельца.
 */
export function roosterAttacks(from: Square, color: Color, board: (Piece | null)[]): Square[] {
  const out: Square[] = [];
  const dr = forwardDir(color);
  // forward-луч до первой занятой клетки включительно
  let t = offset(from, 0, dr);
  while (t !== null) {
    out.push(t);
    if (board[t] !== null) break;
    t = offset(t, 0, dr);
  }
  // две диагонали-вперёд на 1 (шпоры)
  for (const df of [-1, 1] as const) {
    const s = offset(from, df, dr);
    if (s !== null) out.push(s);
  }
  return out;
}

/**
 * Множество клеток, атакуемых данной фигурой с клетки from. Покрывает базовые
 * типы (B3) и эволюционные формы (B2). Используется для детекции шаха и контроля.
 */
export function attacksFrom(piece: Piece, from: Square, board: (Piece | null)[]): Square[] {
  const dr = forwardDir(piece.color);
  const pawnLike: Offset[] = [
    [-1, dr],
    [1, dr],
  ];
  switch (piece.type) {
    // --- базовые ---
    case 'K':
      return leaperTargets(from, KING_STEPS);
    case 'N':
      return leaperTargets(from, KNIGHT);
    case 'B':
      return sliderTargets(from, DIAGONALS, board);
    case 'R':
      return sliderTargets(from, ORTHOGONALS, board);
    case 'Q':
      return sliderTargets(from, QUEEN_DIRS, board);
    case 'P':
      return leaperTargets(from, pawnLike); // пешка бьёт только 2 диагонали-вперёд
    case 'ROO':
      return roosterAttacks(from, piece.color, board);
    // --- эволюционные формы (B2) ---
    case 'N_OUTRIDER':
      return leaperTargets(from, [...KNIGHT, ...WAZIR]);
    case 'N_HUNTER':
      return leaperTargets(from, [...KNIGHT, ...FERZ]);
    case 'B_PRELATE':
      return [...sliderTargets(from, DIAGONALS, board), ...leaperTargets(from, WAZIR)];
    case 'B_ZEALOT':
      return uniqueSquares([...sliderTargets(from, DIAGONALS, board), ...leaperTargets(from, ALFIL)]);
    case 'R_RAM':
      return uniqueSquares([
        ...sliderTargets(from, ORTHOGONALS, board),
        ...leaperTargets(from, DABBABA),
      ]);
    case 'R_ANCHOR':
      return sliderTargets(from, ORTHOGONALS, board); // Ferz move-only НЕ атакует (B2)
    case 'ROO_PHOENIX':
      return leaperTargets(from, [[0, dr], [-1, dr], [1, dr]]); // forward1 + 2 диагонали-вперёд
  }
}

/** Атакована ли клетка target хотя бы одной фигурой цвета `by`. */
export function isSquareAttackedBy(
  board: (Piece | null)[],
  target: Square,
  by: Color,
): boolean {
  for (let s = 0; s < board.length; s++) {
    const p = board[s];
    if (p && p.color === by && attacksFrom(p, s, board).includes(target)) {
      return true;
    }
  }
  return false;
}
