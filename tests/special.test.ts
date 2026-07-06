import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import { generateCastling, generateEnPassant } from '../src/engine/special';
import { applyMove } from '../src/engine/apply';
import { legalMoves } from '../src/engine/legality';
import { emptyBoard, makePiece, makeState } from './helpers';

describe('en passant', () => {
  function epPosition() {
    const board = emptyBoard();
    board[sq(3, 4)] = makePiece('P', 'white'); // d5
    board[sq(4, 4)] = makePiece('P', 'black'); // e5 (just double-pushed)
    board[sq(0, 0)] = makePiece('K', 'white');
    board[sq(0, 7)] = makePiece('K', 'black');
    return makeState(board, 'white', { enPassant: sq(4, 5) }); // e6
  }

  it('is generated when the target is a forward diagonal', () => {
    const moves = generateEnPassant(epPosition());
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      from: sq(3, 4),
      to: sq(4, 5),
      capture: sq(4, 4),
      special: 'enpassant',
    });
  });

  it('removes the captured pawn that sits beside the mover', () => {
    const state = epPosition();
    const ep = generateEnPassant(state)[0];
    const next = applyMove(state, ep);
    expect(next.board[sq(4, 4)]).toBeNull(); // captured black pawn gone
    expect(next.board[sq(4, 5)]).toMatchObject({ type: 'P', color: 'white' }); // mover landed on e6
  });
});

describe('castling (Bastion, B5)', () => {
  function castlingPosition(overrides = {}) {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white'); // f1
    board[sq(9, 0)] = makePiece('R', 'white'); // j1 (kingside)
    board[sq(0, 0)] = makePiece('R', 'white'); // a1 (queenside)
    board[sq(5, 7)] = makePiece('K', 'black'); // f8 far away
    return makeState(board, 'white', {
      castling: { whiteKing: true, whiteQueen: true, blackKing: false, blackQueen: false },
      ...overrides,
    });
  }

  it('offers both sides when squares are empty and unattacked', () => {
    const moves = generateCastling(castlingPosition());
    const sides = moves.map((m) => m.special).sort();
    expect(sides).toEqual(['castle-king', 'castle-queen']);
    const kingside = moves.find((m) => m.special === 'castle-king');
    expect(kingside).toMatchObject({ from: sq(5, 0), to: sq(7, 0) }); // f1 -> h1
  });

  it('moves both king and rook to the right squares (kingside)', () => {
    const state = castlingPosition();
    const kingside = generateCastling(state).find((m) => m.special === 'castle-king')!;
    const next = applyMove(state, kingside);
    expect(next.board[sq(7, 0)]).toMatchObject({ type: 'K', color: 'white' }); // king h1
    expect(next.board[sq(6, 0)]).toMatchObject({ type: 'R', color: 'white' }); // rook g1
    expect(next.board[sq(5, 0)]).toBeNull();
    expect(next.board[sq(9, 0)]).toBeNull();
    expect(next.castling.whiteKing).toBe(false);
    expect(next.castling.whiteQueen).toBe(false);
  });

  it('a piece between king and rook blocks that side', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white');
    board[sq(9, 0)] = makePiece('R', 'white');
    board[sq(0, 0)] = makePiece('R', 'white');
    board[sq(6, 0)] = makePiece('B', 'white'); // bishop on g1 blocks kingside
    board[sq(5, 7)] = makePiece('K', 'black');
    const state = makeState(board, 'white', {
      castling: { whiteKing: true, whiteQueen: true, blackKing: false, blackQueen: false },
    });
    const sides = generateCastling(state).map((m) => m.special);
    expect(sides).toContain('castle-queen');
    expect(sides).not.toContain('castle-king');
  });

  it('king may not pass through an attacked square', () => {
    const state = castlingPosition();
    state.board[sq(6, 7)] = makePiece('R', 'black'); // black rook g8 attacks g1 (king path)
    const sides = generateCastling(state).map((m) => m.special);
    expect(sides).not.toContain('castle-king'); // g1 attacked
    expect(sides).toContain('castle-queen'); // queenside path untouched
  });

  it('castling appears in the full legal move list', () => {
    const state = castlingPosition();
    const castles = legalMoves(state).filter((m) => m.special?.startsWith('castle'));
    expect(castles).toHaveLength(2);
  });
});
