/**
 * Генерация псевдо-легальных ходов Петуха (ROO) — Rules_Clarification B3.
 *
 *  - forward-луч: ход на пустые клетки + взятие первой вражеской, затем стоп.
 *  - боковой шаг ±1 файл: ТОЛЬКО на пустую (без взятия).
 *  - диагонали-вперёд на 1: ТОЛЬКО взятие.
 *  - назад/диагонали-назад: ходов нет (Петух не отступает).
 *
 * Эволюция в Феникса при входе в зону — этап 11 (evolution.ts).
 */

import type { Color, Move, Piece, Square } from '../types';
import { forwardDir, offset } from '../board';

export function roosterMoves(from: Square, color: Color, board: (Piece | null)[]): Move[] {
  const moves: Move[] = [];
  const dr = forwardDir(color);

  // forward-луч
  let t = offset(from, 0, dr);
  while (t !== null) {
    const occ = board[t];
    if (occ === null) {
      moves.push({ from, to: t });
    } else {
      if (occ.color !== color) moves.push({ from, to: t, capture: t });
      break; // первая занятая клетка — стоп в любом случае
    }
    t = offset(t, 0, dr);
  }

  // боковой шаг ±1 файл — только на пустую
  for (const df of [-1, 1] as const) {
    const s = offset(from, df, 0);
    if (s !== null && board[s] === null) moves.push({ from, to: s });
  }

  // диагонали-вперёд — только взятие
  for (const df of [-1, 1] as const) {
    const d = offset(from, df, dr);
    if (d !== null) {
      const occ = board[d];
      if (occ !== null && occ.color !== color) moves.push({ from, to: d, capture: d });
    }
  }

  return moves;
}
