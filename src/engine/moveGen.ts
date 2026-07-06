/**
 * Сбор псевдо-легальных ходов всех фигур стороны, чей сейчас ход.
 *  - обычные ходы фигур (классика, Петух, формы);
 *  - развёртка эволюции для рабочих фигур (ход в зону → варианты с формой, B4);
 *  - спецходы (Бастион, взятие на проходе).
 * Легальность (безопасность короля) — отдельный фильтр в legality.ts (B1).
 */

import type { GameState, Move, Piece, Square } from './types';
import { classicMoves } from './pieces/classic';
import { roosterMoves } from './pieces/rooster';
import { evolvedMoves } from './pieces/evolved';
import { expandEvolution } from './evolution';
import { generateSpecialMoves } from './special';

/** Псевдо-легальные ходы одной фигуры с клетки from (с развёрткой эволюции). */
export function movesForPiece(piece: Piece, from: Square, board: (Piece | null)[]): Move[] {
  let base: Move[];
  switch (piece.type) {
    case 'K':
    case 'Q':
    case 'R':
    case 'B':
    case 'N':
    case 'P':
      base = classicMoves(piece, from, board);
      break;
    case 'ROO':
      base = roosterMoves(from, piece.color, board);
      break;
    case 'N_OUTRIDER':
    case 'N_HUNTER':
    case 'B_PRELATE':
    case 'B_ZEALOT':
    case 'R_RAM':
    case 'R_ANCHOR':
    case 'ROO_PHOENIX':
      base = evolvedMoves(piece, from, board);
      break;
    default:
      throw new Error(`Move generation not implemented for type: ${piece.type}`);
  }
  return expandEvolution(piece, base);
}

/** Все псевдо-легальные ходы стороны state.turn (включая спецходы). */
export function generatePseudoLegal(state: GameState): Move[] {
  const moves: Move[] = [];
  for (let s = 0; s < state.board.length; s++) {
    const p = state.board[s];
    if (p !== null && p.color === state.turn) {
      moves.push(...movesForPiece(p, s, state.board));
    }
  }
  moves.push(...generateSpecialMoves(state));
  return moves;
}
