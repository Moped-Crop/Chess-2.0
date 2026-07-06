import { describe, it, expect } from 'vitest';
import { positionKey } from '../src/engine/hash';
import { createInitialState } from '../src/engine/setup';
import { sq } from '../src/engine/board';
import { emptyBoard, makePiece, makeState } from './helpers';

describe('positionKey (B7)', () => {
  it('is deterministic for the same position', () => {
    expect(positionKey(createInitialState())).toBe(positionKey(createInitialState()));
  });

  it('changes with the side to move', () => {
    const a = createInitialState();
    const b = { ...a, turn: 'black' as const };
    expect(positionKey(a)).not.toBe(positionKey(b));
  });

  it('changes with castling rights', () => {
    const a = createInitialState();
    const b = { ...a, castling: { ...a.castling, whiteKing: false } };
    expect(positionKey(a)).not.toBe(positionKey(b));
  });

  it('changes with the en passant square', () => {
    const a = createInitialState();
    const b = { ...a, enPassant: sq(4, 2) };
    expect(positionKey(a)).not.toBe(positionKey(b));
  });

  it('ignores halfmoveClock and fullmove', () => {
    const a = createInitialState();
    const b = { ...a, halfmoveClock: 99, fullmove: 50 };
    expect(positionKey(a)).toBe(positionKey(b));
  });

  it('distinguishes a base piece from its evolved form', () => {
    const baseBoard = emptyBoard();
    baseBoard[sq(0, 0)] = makePiece('R', 'white');
    const evolvedBoard = emptyBoard();
    evolvedBoard[sq(0, 0)] = makePiece('R_RAM', 'white', { evolved: true });
    expect(positionKey(makeState(baseBoard, 'white'))).not.toBe(
      positionKey(makeState(evolvedBoard, 'white')),
    );
  });
});
