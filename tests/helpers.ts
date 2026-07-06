import type { Color, GameState, Piece, PieceType } from '../src/engine/types';
import { BOARD_SIZE } from '../src/engine/board';
import { legalMoves } from '../src/engine/legality';
import { applyMove } from '../src/engine/apply';

/** Пустая доска длины 80 (все клетки null). */
export function emptyBoard(): (Piece | null)[] {
  return new Array<Piece | null>(BOARD_SIZE).fill(null);
}

/** Удобная фабрика фигуры с дефолтами hasMoved=false, evolved=false. */
export function makePiece(type: PieceType, color: Color, opts: Partial<Piece> = {}): Piece {
  return { type, color, hasMoved: false, evolved: false, ...opts };
}

/** Состояние из доски и очереди хода (для тестов терминалов/легальности). */
export function makeState(
  board: (Piece | null)[],
  turn: Color,
  overrides: Partial<GameState> = {},
): GameState {
  return {
    board,
    turn,
    castling: { whiteKing: false, whiteQueen: false, blackKing: false, blackQueen: false },
    enPassant: null,
    halfmoveClock: 0,
    fullmove: 1,
    history: [],
    result: 'ongoing',
    ...overrides,
  };
}

/** Perft: число листьев дерева легальных ходов на глубину depth. */
export function perft(state: GameState, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of legalMoves(state)) {
    nodes += perft(applyMove(state, m), depth - 1);
  }
  return nodes;
}
