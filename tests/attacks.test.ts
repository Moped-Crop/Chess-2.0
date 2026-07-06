import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import { attacksFrom, isSquareAttackedBy } from '../src/engine/attacks';
import { emptyBoard, makePiece } from './helpers';

describe('attacks — base pieces (B3)', () => {
  it('knight: 8 targets from center, 2 from a corner', () => {
    const board = emptyBoard();
    expect(attacksFrom(makePiece('N', 'white'), sq(3, 3), board)).toHaveLength(8);
    const corner = attacksFrom(makePiece('N', 'white'), sq(0, 0), board);
    expect(corner).toHaveLength(2);
    expect(corner).toEqual(expect.arrayContaining([sq(1, 2), sq(2, 1)]));
  });

  it('rook: ray stops at first occupied square (inclusive)', () => {
    const board = emptyBoard();
    board[sq(2, 0)] = makePiece('P', 'black'); // blocker on c1
    const atk = attacksFrom(makePiece('R', 'white'), sq(0, 0), board);
    expect(atk).toEqual(expect.arrayContaining([sq(1, 0), sq(2, 0)])); // b1, c1
    expect(atk).not.toContain(sq(3, 0)); // d1 is behind the blocker
  });

  it('pawn attacks only the two forward diagonals', () => {
    const board = emptyBoard();
    const atk = attacksFrom(makePiece('P', 'white'), sq(4, 3), board);
    expect(atk).toHaveLength(2);
    expect(atk).toEqual(expect.arrayContaining([sq(3, 4), sq(5, 4)])); // d5, f5
    expect(atk).not.toContain(sq(4, 4)); // e5 (push is not an attack)
  });
});

describe('rooster attacks (B3)', () => {
  it('forward ray to first occupied + spurs; no side/back attacks', () => {
    const board = emptyBoard();
    board[sq(4, 5)] = makePiece('P', 'black'); // blocker on e6
    const atk = attacksFrom(makePiece('ROO', 'white'), sq(4, 3), board); // rooster e4
    // forward ray e5, e6(occupied) + spurs d5, f5
    expect(atk).toEqual(expect.arrayContaining([sq(4, 4), sq(4, 5), sq(3, 4), sq(5, 4)]));
    // not beyond blocker, not sideways, not backward
    expect(atk).not.toContain(sq(4, 6)); // e7
    expect(atk).not.toContain(sq(3, 3)); // d4 (side)
    expect(atk).not.toContain(sq(5, 3)); // f4 (side)
    expect(atk).not.toContain(sq(4, 2)); // e3 (back)
  });

  it('direction follows owner color (black rooster aims down)', () => {
    const board = emptyBoard();
    const atk = attacksFrom(makePiece('ROO', 'black'), sq(4, 4), board); // rooster e5
    expect(atk).toContain(sq(4, 0)); // ray down to e1
    expect(atk).toEqual(expect.arrayContaining([sq(3, 3), sq(5, 3)])); // spurs d4, f4
    expect(atk).not.toContain(sq(4, 5)); // e6 is backward for black
  });
});

describe('evolved forms — attack specifics (B2)', () => {
  it('R_ANCHOR does not attack diagonals (Ferz move-only)', () => {
    const board = emptyBoard();
    const atk = attacksFrom(makePiece('R_ANCHOR', 'white'), sq(4, 3), board);
    expect(atk).toContain(sq(4, 4)); // e5 along the file
    expect(atk).not.toContain(sq(3, 4)); // d5 diagonal — not an attack
    expect(atk).not.toContain(sq(5, 4)); // f5 diagonal — not an attack
  });

  it('ROO_PHOENIX attacks exactly the 3 forward cells (single step, not a ray)', () => {
    const board = emptyBoard();
    const atk = attacksFrom(makePiece('ROO_PHOENIX', 'white'), sq(4, 3), board);
    expect(atk).toHaveLength(3);
    expect(atk).toEqual(expect.arrayContaining([sq(4, 4), sq(3, 4), sq(5, 4)]));
    expect(atk).not.toContain(sq(4, 5)); // e6 — Phoenix forward is one step, not a ray
  });
});

describe('isSquareAttackedBy', () => {
  it('detects an attacked square and respects color', () => {
    const board = emptyBoard();
    board[sq(0, 0)] = makePiece('R', 'white'); // rook a1
    expect(isSquareAttackedBy(board, sq(1, 0), 'white')).toBe(true); // b1 attacked
    expect(isSquareAttackedBy(board, sq(1, 0), 'black')).toBe(false);
  });
});
