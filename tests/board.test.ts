import { describe, it, expect } from 'vitest';
import {
  BOARD_SIZE,
  fileOf,
  rankOf,
  sq,
  onBoard,
  offset,
  forwardDir,
  isLastRank,
  squareName,
  squareFromName,
} from '../src/engine/board';

describe('board coordinates (B8)', () => {
  it('corner indices match the convention', () => {
    expect(sq(0, 0)).toBe(0); // a1
    expect(sq(9, 0)).toBe(9); // j1
    expect(sq(0, 7)).toBe(70); // a8
    expect(sq(9, 7)).toBe(79); // j8
    expect(BOARD_SIZE).toBe(80);
  });

  it('fileOf/rankOf invert sq for every cell', () => {
    for (let s = 0; s < BOARD_SIZE; s++) {
      expect(sq(fileOf(s), rankOf(s))).toBe(s);
    }
  });

  it('onBoard rejects cells outside 10x8', () => {
    expect(onBoard(0, 0)).toBe(true);
    expect(onBoard(9, 7)).toBe(true);
    expect(onBoard(-1, 0)).toBe(false);
    expect(onBoard(10, 0)).toBe(false);
    expect(onBoard(0, 8)).toBe(false);
  });

  it('offset never wraps across the board edge', () => {
    // j1 (file 9) +1 file would be a-file on next rank with raw index math — must be null
    expect(offset(sq(9, 0), 1, 0)).toBeNull();
    expect(offset(sq(0, 0), -1, 0)).toBeNull();
    expect(offset(sq(0, 7), 0, 1)).toBeNull();
    // normal interior step
    expect(offset(sq(4, 3), 1, 1)).toBe(sq(5, 4));
  });

  it('forward direction depends on color', () => {
    expect(forwardDir('white')).toBe(1);
    expect(forwardDir('black')).toBe(-1);
  });

  it('last rank for promotion', () => {
    expect(isLastRank(sq(3, 7), 'white')).toBe(true);
    expect(isLastRank(sq(3, 0), 'white')).toBe(false);
    expect(isLastRank(sq(3, 0), 'black')).toBe(true);
    expect(isLastRank(sq(3, 7), 'black')).toBe(false);
  });

  it('algebraic names round-trip', () => {
    expect(squareName(0)).toBe('a1');
    expect(squareName(9)).toBe('j1');
    expect(squareName(70)).toBe('a8');
    expect(squareName(79)).toBe('j8');
    for (let s = 0; s < BOARD_SIZE; s++) {
      expect(squareFromName(squareName(s))).toBe(s);
    }
  });
});
