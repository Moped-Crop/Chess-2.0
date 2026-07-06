/**
 * Легальность ходов и детекция шаха — Rules_Clarification B1.
 *
 * Правило B1: ход легален ⇔ после его применения король ходящей стороны НЕ под
 * боем. Никаких дополнительных предикатов про эволюцию и шах НЕ добавляем.
 */

import type { Color, GameState, Move, Piece, Square } from './types';
import { opposite } from './board';
import { isSquareAttackedBy } from './attacks';
import { generatePseudoLegal } from './moveGen';
import { applyMove } from './apply';

/** Индекс клетки короля данного цвета, либо null. */
export function findKing(board: (Piece | null)[], color: Color): Square | null {
  for (let s = 0; s < board.length; s++) {
    const p = board[s];
    if (p !== null && p.type === 'K' && p.color === color) return s;
  }
  return null;
}

/** Под боем ли король цвета color на данной доске. */
export function isKingInCheck(board: (Piece | null)[], color: Color): boolean {
  const king = findKing(board, color);
  return king !== null && isSquareAttackedBy(board, king, opposite(color));
}

/** Легальные ходы: псевдо-легальные, после которых свой король не под боем (B1). */
export function legalMoves(state: GameState): Move[] {
  const mover = state.turn;
  return generatePseudoLegal(state).filter((m) => {
    const next = applyMove(state, m);
    return !isKingInCheck(next.board, mover);
  });
}
