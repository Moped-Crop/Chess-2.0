import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import {
  computeResult,
  isCheckmate,
  isStalemate,
  isInsufficientMaterial,
  isThreefoldRepetition,
} from '../src/engine/terminal';
import { positionKey } from '../src/engine/hash';
import { createInitialState } from '../src/engine/setup';
import { emptyBoard, makePiece, makeState } from './helpers';

describe('checkmate / stalemate', () => {
  it('detects checkmate: K+Q vs K in the corner', () => {
    const board = emptyBoard();
    board[sq(0, 7)] = makePiece('K', 'black'); // a8
    board[sq(1, 6)] = makePiece('Q', 'white'); // b7 gives mate
    board[sq(1, 5)] = makePiece('K', 'white'); // b6 defends b7
    const state = makeState(board, 'black');
    expect(isCheckmate(state)).toBe(true);
    expect(computeResult(state)).toBe('white');
  });

  it('detects stalemate as a draw', () => {
    const board = emptyBoard();
    board[sq(0, 7)] = makePiece('K', 'black'); // a8, not in check
    board[sq(1, 5)] = makePiece('Q', 'white'); // b6 covers a7, b7, b8
    board[sq(4, 0)] = makePiece('K', 'white'); // e1
    const state = makeState(board, 'black');
    expect(isStalemate(state)).toBe(true);
    expect(computeResult(state)).toBe('draw');
  });
});

describe('draw rules', () => {
  it('75-move rule: halfmoveClock >= 150', () => {
    const state = { ...createInitialState(), halfmoveClock: 150 };
    expect(computeResult(state)).toBe('draw');
  });

  it('threefold repetition', () => {
    const base = createInitialState();
    const key = positionKey(base);
    const state = { ...base, history: [key, key, key] };
    expect(isThreefoldRepetition(state)).toBe(true);
    expect(computeResult(state)).toBe('draw');
  });

  it('insufficient material stub: K vs K and K vs K+minor draw; K vs K+R does not', () => {
    const kvk = emptyBoard();
    kvk[sq(0, 0)] = makePiece('K', 'white');
    kvk[sq(7, 7)] = makePiece('K', 'black');
    expect(isInsufficientMaterial(kvk)).toBe(true);

    const kvkn = kvk.slice();
    kvkn[sq(3, 3)] = makePiece('N', 'white');
    expect(isInsufficientMaterial(kvkn)).toBe(true);

    const kvkr = kvk.slice();
    kvkr[sq(3, 3)] = makePiece('R', 'white');
    expect(isInsufficientMaterial(kvkr)).toBe(false);
  });

  it('the start position is not terminal', () => {
    expect(computeResult(createInitialState())).toBe('ongoing');
  });
});
