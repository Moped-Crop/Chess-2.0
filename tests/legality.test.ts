import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import { isKingInCheck, findKing, legalMoves } from '../src/engine/legality';
import { applyMove } from '../src/engine/apply';
import { createInitialState } from '../src/engine/setup';
import { emptyBoard, makePiece, perft } from './helpers';

describe('check detection (B1)', () => {
  it('finds the king and detects a rook check', () => {
    const board = emptyBoard();
    board[sq(4, 0)] = makePiece('K', 'white'); // e1
    board[sq(4, 7)] = makePiece('R', 'black'); // e8 — same file, open
    expect(findKing(board, 'white')).toBe(sq(4, 0));
    expect(isKingInCheck(board, 'white')).toBe(true);
    expect(isKingInCheck(board, 'black')).toBe(false);
  });

  it('a blocker removes the check', () => {
    const board = emptyBoard();
    board[sq(4, 0)] = makePiece('K', 'white'); // e1
    board[sq(4, 7)] = makePiece('R', 'black'); // e8
    board[sq(4, 3)] = makePiece('P', 'white'); // e4 blocks the file
    expect(isKingInCheck(board, 'white')).toBe(false);
  });
});

describe('legal move filtering', () => {
  it('a pinned piece may not expose its king', () => {
    const board = emptyBoard();
    board[sq(4, 0)] = makePiece('K', 'white'); // e1
    board[sq(4, 2)] = makePiece('N', 'white'); // e3 pinned along the e-file
    board[sq(4, 7)] = makePiece('R', 'black'); // e8 pinning
    const state = { ...createInitialState(), board, turn: 'white' as const };
    const knightMoves = legalMoves(state).filter((m) => m.from === sq(4, 2));
    expect(knightMoves).toHaveLength(0); // any knight move would expose the king
  });
});

describe('perft from the start position', () => {
  it('depth 1 = 24', () => {
    expect(perft(createInitialState(), 1)).toBe(24);
  });

  it('depth 2 = 576 (24 white x 24 black, no contact yet)', () => {
    expect(perft(createInitialState(), 2)).toBe(576);
  });

  it('a real first move keeps the game going (no false mate)', () => {
    const start = createInitialState();
    const e4ish = legalMoves(start)[0];
    const next = applyMove(start, e4ish);
    expect(legalMoves(next).length).toBeGreaterThan(0);
    expect(next.turn).toBe('black');
  });
});
