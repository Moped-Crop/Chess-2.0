import { describe, it, expect } from 'vitest';
import { LESSONS } from '../src/app/tutorial/lessons';
import { BOARD_SIZE } from '../src/engine/board';
import type { Piece } from '../src/engine/types';

const inRange = (s: number) => s >= 0 && s < BOARD_SIZE;

describe('tutorial lessons', () => {
  it('has several lessons, each with title, text and a non-empty script', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(8);
    for (const l of LESSONS) {
      expect(l.title.ru.length).toBeGreaterThan(0);
      expect(l.title.en.length).toBeGreaterThan(0);
      expect(l.text.ru.length).toBeGreaterThan(0);
      expect(l.text.en.length).toBeGreaterThan(0);
      expect(l.script.length).toBeGreaterThan(0);
    }
  });

  it('boards are 80 cells and all script squares are valid', () => {
    for (const l of LESSONS) {
      expect(l.board.length).toBe(BOARD_SIZE);
      for (const st of l.script) {
        if (st.t === 'marks') for (const m of st.marks) expect(inRange(m.sq)).toBe(true);
        if (st.t === 'arrow' || st.t === 'move') {
          expect(inRange(st.from)).toBe(true);
          expect(inRange(st.to)).toBe(true);
        }
        if (st.t === 'move' && st.capture !== undefined) expect(inRange(st.capture)).toBe(true);
        if (st.t === 'transform' || st.t === 'check' || st.t === 'mate') {
          expect(inRange(st.square)).toBe(true);
        }
      }
    }
  });

  it('panels always offer options and picks are in range', () => {
    for (const l of LESSONS) {
      let options = 0;
      for (const st of l.script) {
        if (st.t === 'panel') {
          expect(st.options.length).toBeGreaterThan(0);
          options = st.options.length;
        }
        if (st.t === 'pick') {
          expect(st.index).toBeGreaterThanOrEqual(0);
          expect(st.index).toBeLessThan(options);
        }
      }
    }
  });

  it('every scripted move starts from an occupied square (scenes stay consistent)', () => {
    for (const l of LESSONS) {
      const board: (Piece | null)[] = l.board.slice();
      for (const st of l.script) {
        if (st.t === 'move') {
          expect(board[st.from], `${l.title.en}: no piece at from=${st.from}`).not.toBeNull();
          if (st.capture !== undefined && st.capture !== st.to) {
            expect(board[st.capture], `${l.title.en}: en-passant victim missing`).not.toBeNull();
          }
          if (st.capture !== undefined) board[st.capture] = null;
          board[st.to] = board[st.from];
          board[st.from] = null;
          if (st.rook) {
            expect(board[st.rook.from], `${l.title.en}: castling rook missing`).not.toBeNull();
            board[st.rook.to] = board[st.rook.from];
            board[st.rook.from] = null;
          }
        }
        if (st.t === 'transform') {
          expect(board[st.square], `${l.title.en}: transform on empty square`).not.toBeNull();
          const old = board[st.square]!;
          board[st.square] = { ...old, type: st.into, evolved: true };
        }
      }
    }
  });
});
