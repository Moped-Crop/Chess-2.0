import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import { pawnMoves, classicMoves } from '../src/engine/pieces/classic';
import { roosterMoves } from '../src/engine/pieces/rooster';
import { generatePseudoLegal } from '../src/engine/moveGen';
import { createInitialState } from '../src/engine/setup';
import { emptyBoard, makePiece } from './helpers';

describe('classic move generation', () => {
  it('knight from b1 at start has 2 moves (a3, c3)', () => {
    const s = createInitialState();
    const moves = classicMoves(makePiece('N', 'white'), sq(1, 0), s.board);
    const tos = moves.map((m) => m.to).sort((a, b) => a - b);
    expect(tos).toEqual([sq(0, 2), sq(2, 2)].sort((a, b) => a - b)); // a3, c3
  });

  it('pawn at start pushes one or two', () => {
    const board = emptyBoard();
    const moves = pawnMoves(sq(4, 1), 'white', board); // e2
    const tos = moves.map((m) => m.to).sort((a, b) => a - b);
    expect(tos).toEqual([sq(4, 2), sq(4, 3)].sort((a, b) => a - b)); // e3, e4
  });

  it('pawn captures only diagonally forward onto enemies', () => {
    const board = emptyBoard();
    board[sq(5, 2)] = makePiece('P', 'black'); // enemy on f3
    board[sq(3, 2)] = makePiece('P', 'white'); // own piece on d3
    const moves = pawnMoves(sq(4, 1), 'white', board); // e2
    const captures = moves.filter((m) => m.capture !== undefined).map((m) => m.to);
    expect(captures).toEqual([sq(5, 2)]); // only f3 (enemy); d3 is own
  });

  it('pawn promotion expands into five moves on the last rank', () => {
    const board = emptyBoard();
    const moves = pawnMoves(sq(0, 6), 'white', board); // a7 -> a8
    expect(moves).toHaveLength(5);
    expect(moves.map((m) => m.promotion).sort()).toEqual(['B', 'N', 'Q', 'R', 'ROO']);
  });
});

describe('rooster move generation (B3)', () => {
  it('on open board: forward ray to the edge + two side steps, no backward', () => {
    const board = emptyBoard();
    const moves = roosterMoves(sq(4, 3), 'white', board); // e4
    const tos = moves.map((m) => m.to).sort((a, b) => a - b);
    // forward e5,e6,e7,e8 + side d4,f4
    expect(tos).toEqual(
      [sq(4, 4), sq(4, 5), sq(4, 6), sq(4, 7), sq(3, 3), sq(5, 3)].sort((a, b) => a - b),
    );
    expect(moves.every((m) => m.capture === undefined)).toBe(true);
    expect(tos).not.toContain(sq(4, 2)); // e3 backward — never
  });

  it('forward ray captures the first enemy and stops; side step never captures', () => {
    const board = emptyBoard();
    board[sq(4, 5)] = makePiece('P', 'black'); // enemy e6
    board[sq(3, 3)] = makePiece('P', 'black'); // enemy d4 beside (side step must NOT capture)
    const moves = roosterMoves(sq(4, 3), 'white', board); // e4
    const fwd = moves.find((m) => m.to === sq(4, 5));
    expect(fwd?.capture).toBe(sq(4, 5)); // captures e6
    expect(moves.some((m) => m.to === sq(4, 6))).toBe(false); // not past the blocker
    expect(moves.some((m) => m.to === sq(3, 3))).toBe(false); // d4 occupied by enemy: no side capture
    expect(moves.some((m) => m.to === sq(5, 3))).toBe(true); // f4 empty: side move ok
  });

  it('forward diagonals capture only', () => {
    const board = emptyBoard();
    board[sq(3, 4)] = makePiece('N', 'black'); // enemy d5 (forward-left diagonal)
    const moves = roosterMoves(sq(4, 3), 'white', board); // e4
    const diag = moves.find((m) => m.to === sq(3, 4));
    expect(diag?.capture).toBe(sq(3, 4));
    expect(moves.some((m) => m.to === sq(5, 4))).toBe(false); // f5 empty -> no diagonal move
  });
});

describe('pseudo-legal generation from the start', () => {
  it('white has 24 pseudo-legal moves (20 pawn + 4 knight)', () => {
    const moves = generatePseudoLegal(createInitialState());
    expect(moves).toHaveLength(24);
  });
});
