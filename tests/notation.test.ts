import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import { applyMove } from '../src/engine/apply';
import { computeResult } from '../src/engine/terminal';
import { createInitialState } from '../src/engine/setup';
import { moveSan } from '../src/app/notation';
import { emptyBoard, makePiece, makeState } from './helpers';
import type { Move } from '../src/engine/types';

// Как в сторе: после хода итог досчитывается (нужно для суффикса мата #).
function san(move: Move, before = createInitialState()) {
  const applied = applyMove(before, move);
  const after = { ...applied, result: computeResult(applied) };
  return moveSan(move, after);
}

describe('move notation (san, без буквы фигуры — её рисует иконка)', () => {
  it('обычный ход: откуда–куда', () => {
    expect(san({ from: sq(1, 0), to: sq(2, 2) })).toBe('b1–c3');
    expect(san({ from: sq(4, 1), to: sq(4, 3) })).toBe('e2–e4');
  });

  it('взятие через ×', () => {
    const board = emptyBoard();
    board[sq(0, 0)] = makePiece('R', 'white');
    board[sq(0, 4)] = makePiece('P', 'black');
    board[sq(7, 0)] = makePiece('K', 'white');
    board[sq(7, 7)] = makePiece('K', 'black');
    expect(san({ from: sq(0, 0), to: sq(0, 4), capture: sq(0, 4) }, makeState(board, 'white'))).toBe(
      'a1×a5',
    );
  });

  it('рокировка O-O / O-O-O', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white');
    board[sq(9, 0)] = makePiece('R', 'white');
    board[sq(5, 7)] = makePiece('K', 'black');
    expect(san({ from: sq(5, 0), to: sq(7, 0), special: 'castle-king' }, makeState(board, 'white'))).toBe(
      'O-O',
    );
  });

  it('превращение =форма', () => {
    const board = emptyBoard();
    board[sq(0, 6)] = makePiece('P', 'white');
    board[sq(4, 4)] = makePiece('K', 'black');
    board[sq(7, 0)] = makePiece('K', 'white');
    expect(san({ from: sq(0, 6), to: sq(0, 7), promotion: 'Q' }, makeState(board, 'white'))).toBe(
      'a7–a8=Ф',
    );
  });

  it('эволюция →форма', () => {
    const board = emptyBoard();
    board[sq(3, 3)] = makePiece('N', 'white');
    board[sq(0, 0)] = makePiece('K', 'white');
    board[sq(9, 7)] = makePiece('K', 'black');
    expect(san({ from: sq(3, 3), to: sq(4, 5), evolveTo: 'N_HUNTER' }, makeState(board, 'white'))).toBe(
      'd4–e6→Лв',
    );
  });

  it('шах +, мат #', () => {
    const checkBoard = emptyBoard();
    checkBoard[sq(0, 0)] = makePiece('R', 'white');
    checkBoard[sq(4, 7)] = makePiece('K', 'black');
    checkBoard[sq(7, 0)] = makePiece('K', 'white');
    expect(san({ from: sq(0, 0), to: sq(4, 0) }, makeState(checkBoard, 'white'))).toBe('a1–e1+');

    const mateBoard = emptyBoard();
    mateBoard[sq(0, 7)] = makePiece('K', 'black');
    mateBoard[sq(1, 0)] = makePiece('Q', 'white');
    mateBoard[sq(2, 5)] = makePiece('K', 'white');
    expect(san({ from: sq(1, 0), to: sq(1, 6) }, makeState(mateBoard, 'white'))).toBe('b1–b7#');
  });
});
