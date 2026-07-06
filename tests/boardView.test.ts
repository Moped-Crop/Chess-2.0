import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import { squareToXY } from '../src/app/boardView';

const C = 10;

describe('board orientation (squareToXY)', () => {
  it('white at bottom: a1 bottom-left, j8 top-right', () => {
    expect(squareToXY(sq(0, 0), false, C)).toEqual({ x: 0, y: 70 }); // a1
    expect(squareToXY(sq(9, 7), false, C)).toEqual({ x: 90, y: 0 }); // j8
  });

  it('flipped: a1 moves to top-right, j8 to bottom-left', () => {
    expect(squareToXY(sq(0, 0), true, C)).toEqual({ x: 90, y: 0 }); // a1
    expect(squareToXY(sq(9, 7), true, C)).toEqual({ x: 0, y: 70 }); // j8
  });
});
