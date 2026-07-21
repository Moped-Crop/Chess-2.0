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
 * Обход атакуемых клеток БЕЗ создания массива.
 *
 * Зачем: проверка шаха вызывается для каждого хода-кандидата (фильтр B1), то
 * есть десятки тысяч раз в секунду при работе бота. Собирать ради неё массив
 * клеток на каждую фигуру, а потом искать в нём одну — расточительно: обход с
 * досрочным выходом делает ту же работу без единой аллокации.
 *
 * visit возвращает true, чтобы прервать обход. Функция возвращает true, если
 * обход был прерван.
 *
 * ВАЖНО: геометрия описана здесь ОДИН раз — attacksFrom построен на этом же
 * обходе. Двух определений правил быть не должно.
 */
type AttackVisitor = (s: Square) => boolean;

function visitLeaper(from: Square, offsets: readonly Offset[], visit: AttackVisitor): boolean {
  for (const [df, dr] of offsets) {
    const t = offset(from, df, dr);
    if (t !== null && visit(t)) return true;
  }
  return false;
}

function visitSlider(
  from: Square,
  dirs: readonly Offset[],
  board: (Piece | null)[],
  visit: AttackVisitor,
): boolean {
  for (const [df, dr] of dirs) {
    let t = offset(from, df, dr);
    while (t !== null) {
      if (visit(t)) return true;
      if (board[t] !== null) break; // первая занятая клетка под боем, дальше стоп
      t = offset(t, df, dr);
    }
  }
  return false;
}

export function forEachAttack(
  piece: Piece,
  from: Square,
  board: (Piece | null)[],
  visit: AttackVisitor,
): boolean {
  const dr = forwardDir(piece.color);
  switch (piece.type) {
    // --- базовые ---
    case 'K':
      return visitLeaper(from, KING_STEPS, visit);
    case 'N':
      return visitLeaper(from, KNIGHT, visit);
    case 'B':
      return visitSlider(from, DIAGONALS, board, visit);
    case 'R':
      return visitSlider(from, ORTHOGONALS, board, visit);
    case 'Q':
      return visitSlider(from, QUEEN_DIRS, board, visit);
    case 'P':
      // Пешка бьёт только 2 диагонали-вперёд.
      return visitLeaper(from, [
        [-1, dr],
        [1, dr],
      ], visit);
    case 'ROO': {
      // B3: forward-луч до первой занятой включительно + 2 диагонали-вперёд.
      let t = offset(from, 0, dr);
      while (t !== null) {
        if (visit(t)) return true;
        if (board[t] !== null) break;
        t = offset(t, 0, dr);
      }
      return visitLeaper(from, [
        [-1, dr],
        [1, dr],
      ], visit);
    }
    // --- эволюционные формы (B2) ---
    case 'N_OUTRIDER':
      return visitLeaper(from, [...KNIGHT, ...WAZIR], visit);
    case 'N_HUNTER':
      return visitLeaper(from, [...KNIGHT, ...FERZ], visit);
    case 'B_PRELATE':
      return (
        visitSlider(from, DIAGONALS, board, visit) || visitLeaper(from, WAZIR, visit)
      );
    case 'B_ZEALOT':
      return visitSlider(from, DIAGONALS, board, visit) || visitLeaper(from, ALFIL, visit);
    case 'R_RAM':
      return visitSlider(from, ORTHOGONALS, board, visit) || visitLeaper(from, DABBABA, visit);
    case 'R_ANCHOR':
      return visitSlider(from, ORTHOGONALS, board, visit); // Ferz move-only НЕ атакует (B2)
    case 'ROO_PHOENIX':
      return visitLeaper(from, [
        [0, dr],
        [-1, dr],
        [1, dr],
      ], visit); // forward1 + 2 диагонали-вперёд
  }
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
  const out: Square[] = [];
  forEachAttack(piece, from, board, (s) => {
    out.push(s);
    return false; // не прерываем — нужен полный список
  });
  // Составные формы (слайдер + прыжок) достигают части клеток двумя способами:
  // Ревнитель по чистой диагонали — и лучом, и Alfil-прыжком, Таран — лучом и
  // Dabbaba. Без дедупликации UI получил бы два одинаковых хода.
  return piece.type === 'B_ZEALOT' || piece.type === 'R_RAM' ? uniqueSquares(out) : out;
}

/** Атакована ли клетка target хотя бы одной фигурой цвета `by`. */
export function isSquareAttackedBy(
  board: (Piece | null)[],
  target: Square,
  by: Color,
): boolean {
  for (let s = 0; s < board.length; s++) {
    const p = board[s];
    // Обход с досрочным выходом: как только цель найдена, дальше не смотрим —
    // и ни одного промежуточного массива не создаётся.
    if (p !== null && p.color === by && forEachAttack(p, s, board, (t) => t === target)) {
      return true;
    }
  }
  return false;
}
