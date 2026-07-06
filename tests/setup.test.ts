import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { sq, squareFromName } from '../src/engine/board';
import type { Piece } from '../src/engine/types';

describe('initial position (GDD §0)', () => {
  const s = createInitialState();

  it('has 20 pieces per side, white to move', () => {
    const white = s.board.filter((p): p is Piece => p?.color === 'white').length;
    const black = s.board.filter((p): p is Piece => p?.color === 'black').length;
    expect(white).toBe(20);
    expect(black).toBe(20);
    expect(s.turn).toBe('white');
    expect(s.fullmove).toBe(1);
    expect(s.castling).toEqual({
      whiteKing: true,
      whiteQueen: true,
      blackKing: true,
      blackQueen: true,
    });
  });

  it('back rank layout: R N B ROO Q K ROO B N R', () => {
    const layout = ['R', 'N', 'B', 'ROO', 'Q', 'K', 'ROO', 'B', 'N', 'R'];
    for (let file = 0; file < 10; file++) {
      expect(s.board[sq(file, 0)]).toMatchObject({ type: layout[file], color: 'white' });
      expect(s.board[sq(file, 7)]).toMatchObject({ type: layout[file], color: 'black' });
    }
  });

  it('kings on f, queens on e, roosters on d and g', () => {
    expect(s.board[squareFromName('f1')]).toMatchObject({ type: 'K', color: 'white' });
    expect(s.board[squareFromName('f8')]).toMatchObject({ type: 'K', color: 'black' });
    expect(s.board[squareFromName('e1')]).toMatchObject({ type: 'Q', color: 'white' });
    expect(s.board[squareFromName('d1')]).toMatchObject({ type: 'ROO', color: 'white' });
    expect(s.board[squareFromName('g1')]).toMatchObject({ type: 'ROO', color: 'white' });
  });

  it('ranks 2 and 7 are full of pawns', () => {
    for (let file = 0; file < 10; file++) {
      expect(s.board[sq(file, 1)]).toMatchObject({ type: 'P', color: 'white' });
      expect(s.board[sq(file, 6)]).toMatchObject({ type: 'P', color: 'black' });
    }
  });
});
