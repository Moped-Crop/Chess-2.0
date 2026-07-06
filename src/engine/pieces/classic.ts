/**
 * Генерация псевдо-легальных ходов классических фигур (K, Q, R, B, N, P).
 * «Псевдо-легальные» = по правилам фигуры, БЕЗ проверки безопасности короля
 * (её делает legality.ts). Спецходы (рокировка, e.p.) и эволюция — отдельно.
 */

import type { Color, Move, Piece, PromotionType, Square } from '../types';
import { forwardDir, isLastRank, offset, rankOf } from '../board';
import { attacksFrom } from '../attacks';

/** Цели превращения пешки (B4) — обязательный выбор из пяти. */
const PROMOTIONS: readonly PromotionType[] = ['Q', 'R', 'B', 'N', 'ROO'];

/**
 * Для фигур, у которых ходы совпадают с атаками (K, Q, R, B, N): пустая
 * целевая клетка → ход; вражеская → взятие; своя → пропуск.
 */
export function targetsToMoves(piece: Piece, from: Square, board: (Piece | null)[]): Move[] {
  const moves: Move[] = [];
  for (const to of attacksFrom(piece, from, board)) {
    const occ = board[to];
    if (occ === null) {
      moves.push({ from, to });
    } else if (occ.color !== piece.color) {
      moves.push({ from, to, capture: to });
    }
  }
  return moves;
}

/** Добавить ход пешки, разворачивая превращение в 5 вариантов на последнем ранге. */
function addPawnMove(
  moves: Move[],
  from: Square,
  to: Square,
  color: Color,
  capture?: Square,
): void {
  if (isLastRank(to, color)) {
    for (const promotion of PROMOTIONS) {
      moves.push(capture === undefined ? { from, to, promotion } : { from, to, capture, promotion });
    }
  } else {
    moves.push(capture === undefined ? { from, to } : { from, to, capture });
  }
}

/** Ходы пешки: ход на 1 (или 2 со старта), взятие 1 по диагонали-вперёд, превращение. */
export function pawnMoves(from: Square, color: Color, board: (Piece | null)[]): Move[] {
  const moves: Move[] = [];
  const dr = forwardDir(color);

  const one = offset(from, 0, dr);
  if (one !== null && board[one] === null) {
    addPawnMove(moves, from, one, color);
    const startRank = color === 'white' ? 1 : 6;
    if (rankOf(from) === startRank) {
      const two = offset(from, 0, dr * 2);
      if (two !== null && board[two] === null) moves.push({ from, to: two });
    }
  }

  for (const df of [-1, 1] as const) {
    const t = offset(from, df, dr);
    if (t !== null) {
      const occ = board[t];
      if (occ !== null && occ.color !== color) addPawnMove(moves, from, t, color, t);
    }
  }
  // Взятие на проходе — в special.ts (нужно state.enPassant). Здесь не генерируется.
  return moves;
}

/** Псевдо-легальные ходы классической фигуры. */
export function classicMoves(piece: Piece, from: Square, board: (Piece | null)[]): Move[] {
  if (piece.type === 'P') return pawnMoves(from, piece.color, board);
  return targetsToMoves(piece, from, board);
}
