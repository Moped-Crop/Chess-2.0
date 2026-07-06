import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import { applyMove } from '../src/engine/apply';
import { createInitialState } from '../src/engine/setup';
import { movesForPiece } from '../src/engine/moveGen';
import { emptyBoard, makePiece, makeState } from './helpers';

describe('rules interactions', () => {
  describe('en passant target is transient', () => {
    const start = createInitialState();

    it('a double pawn push sets the e.p. square', () => {
      const s1 = applyMove(start, { from: sq(4, 1), to: sq(4, 3) }); // e2-e4
      expect(s1.enPassant).toBe(sq(4, 2)); // e3
    });

    it('a following non-double move clears it', () => {
      const s1 = applyMove(start, { from: sq(4, 1), to: sq(4, 3) });
      const s2 = applyMove(s1, { from: sq(0, 6), to: sq(0, 5) }); // a7-a6
      expect(s2.enPassant).toBeNull();
    });

    it('a black double push sets its own e.p. square', () => {
      const s1 = applyMove(start, { from: sq(4, 1), to: sq(4, 3) });
      const s3 = applyMove(s1, { from: sq(3, 6), to: sq(3, 4) }); // d7-d5
      expect(s3.enPassant).toBe(sq(3, 5)); // d6
    });
  });

  it('capturing a rook on its home square removes that castling right', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white'); // f1
    board[sq(9, 0)] = makePiece('R', 'white'); // j1 (kingside rook)
    board[sq(9, 7)] = makePiece('R', 'black'); // j8
    board[sq(0, 7)] = makePiece('K', 'black'); // a8
    const state = makeState(board, 'black', {
      castling: { whiteKing: true, whiteQueen: true, blackKing: false, blackQueen: false },
    });
    const next = applyMove(state, { from: sq(9, 7), to: sq(9, 0), capture: sq(9, 0) }); // Rj8xj1
    expect(next.castling.whiteKing).toBe(false);
    expect(next.board[sq(9, 0)]).toMatchObject({ type: 'R', color: 'black' });
  });

  it('a pawn promoting to a Rooster is marked evolved', () => {
    const board = emptyBoard();
    board[sq(0, 6)] = makePiece('P', 'white'); // a7
    board[sq(4, 4)] = makePiece('K', 'black');
    board[sq(7, 0)] = makePiece('K', 'white');
    const state = makeState(board, 'white');
    const next = applyMove(state, { from: sq(0, 6), to: sq(0, 7), promotion: 'ROO' });
    expect(next.board[sq(0, 7)]).toMatchObject({ type: 'ROO', color: 'white', evolved: true });
  });

  it('a promoted Rooster in its zone does not re-evolve (B4)', () => {
    const board = emptyBoard();
    const roo = makePiece('ROO', 'white', { evolved: true }); // как после превращения
    board[sq(4, 6)] = roo; // e7 — ранг 6, в зоне Петуха
    const moves = movesForPiece(roo, sq(4, 6), board);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.evolveTo === undefined)).toBe(true);
  });
});
