/**
 * Стартовая позиция Chess 2 (GDD §0).
 *
 * Ряд 1 (белые, a→j): Ладья, Конь, Слон, Петух, Ферзь, Король, Петух, Слон, Конь, Ладья.
 * Ряд 2: 10 пешек. Чёрные — зеркально (ряды 8 и 7). По 20 фигур на сторону.
 */

import type { GameState, Piece, PieceType } from './types';
import { BOARD_SIZE, FILE_COUNT, sq } from './board';
import type { Color } from './types';
import { positionKey } from './hash';

const BACK_RANK: readonly PieceType[] = ['R', 'N', 'B', 'ROO', 'Q', 'K', 'ROO', 'B', 'N', 'R'];

function piece(type: PieceType, color: Color): Piece {
  return { type, color, hasMoved: false, evolved: false };
}

/** Новое состояние партии в стартовой позиции (белые ходят). */
export function createInitialState(): GameState {
  const board: (Piece | null)[] = new Array<Piece | null>(BOARD_SIZE).fill(null);
  for (let file = 0; file < FILE_COUNT; file++) {
    board[sq(file, 0)] = piece(BACK_RANK[file], 'white');
    board[sq(file, 1)] = piece('P', 'white');
    board[sq(file, 6)] = piece('P', 'black');
    board[sq(file, 7)] = piece(BACK_RANK[file], 'black');
  }
  const state: GameState = {
    board,
    turn: 'white',
    castling: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
    enPassant: null,
    halfmoveClock: 0,
    fullmove: 1,
    history: [],
    result: 'ongoing',
  };
  // Стартовая позиция тоже учитывается для повторения (B7).
  state.history.push(positionKey(state));
  return state;
}
