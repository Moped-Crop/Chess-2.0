/**
 * Регрессия: дубликаты ходов у составных форм (слайдер + прыжок).
 *
 * Ревнитель (B_ZEALOT = слон-слайдер + Alfil) и Таран (R_RAM = ладья-слайдер +
 * Dabbaba) при чистом пути достигали клетки (±2) и лучом, и прыжком — клетка
 * попадала в список дважды, UI видел «два варианта» одного хода и открывал
 * ложное/пустое окно выбора. Ходы фигуры не должны содержать дублей.
 */

import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import { movesForPiece } from '../src/engine/moveGen';
import { attacksFrom } from '../src/engine/attacks';
import { legalMoves } from '../src/engine/legality';
import { emptyBoard, makePiece, makeState } from './helpers';
import type { Move } from '../src/engine/types';

/** Смысловой ключ хода — два хода с одним ключом неразличимы для игрока. */
function moveKey(m: Move): string {
  return `${m.from}:${m.to}:${m.capture ?? ''}:${m.promotion ?? ''}:${m.evolveTo ?? ''}:${m.special ?? ''}`;
}

function expectNoDuplicates(moves: Move[]): void {
  const keys = moves.map(moveKey);
  expect(new Set(keys).size).toBe(keys.length);
}

describe('no duplicate moves for compound evolved forms', () => {
  it('Zealot on empty board: alfil target reachable by slider appears once', () => {
    const board = emptyBoard();
    const zealot = makePiece('B_ZEALOT', 'white', { evolved: true });
    board[sq(4, 3)] = zealot; // e4
    const moves = movesForPiece(zealot, sq(4, 3), board);
    expectNoDuplicates(moves);
    // g6 = (6,5): достижима и слайдером через f5, и прыжком Alfil — ровно один ход.
    expect(moves.filter((m) => m.to === sq(6, 5))).toHaveLength(1);
  });

  it('Zealot with blocked diagonal keeps the alfil jump (single move)', () => {
    const board = emptyBoard();
    const zealot = makePiece('B_ZEALOT', 'white', { evolved: true });
    board[sq(4, 3)] = zealot; // e4
    board[sq(5, 4)] = makePiece('P', 'white'); // f5 своей пешкой — слайдер заблокирован
    const moves = movesForPiece(zealot, sq(4, 3), board);
    expectNoDuplicates(moves);
    expect(moves.filter((m) => m.to === sq(6, 5))).toHaveLength(1); // только прыжок
  });

  it('Ram on empty board: dabbaba target reachable by slider appears once', () => {
    const board = emptyBoard();
    const ram = makePiece('R_RAM', 'white', { evolved: true });
    board[sq(4, 3)] = ram; // e4
    const moves = movesForPiece(ram, sq(4, 3), board);
    expectNoDuplicates(moves);
    // e6 = (4,5): луч через e5 и прыжок Dabbaba — ровно один ход.
    expect(moves.filter((m) => m.to === sq(4, 5))).toHaveLength(1);
  });

  it('attacksFrom returns unique squares for Zealot and Ram', () => {
    const board = emptyBoard();
    const zealot = makePiece('B_ZEALOT', 'white', { evolved: true });
    const ram = makePiece('R_RAM', 'black', { evolved: true });
    board[sq(2, 2)] = zealot;
    board[sq(7, 5)] = ram;
    for (const [p, s] of [
      [zealot, sq(2, 2)],
      [ram, sq(7, 5)],
    ] as const) {
      const a = attacksFrom(p, s, board);
      expect(new Set(a).size).toBe(a.length);
    }
  });

  it('full legal move list of a position with compound forms has no duplicates', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white');
    board[sq(5, 7)] = makePiece('K', 'black');
    board[sq(4, 3)] = makePiece('B_ZEALOT', 'white', { evolved: true });
    board[sq(1, 1)] = makePiece('R_RAM', 'white', { evolved: true });
    const state = makeState(board, 'white');
    expectNoDuplicates(legalMoves(state));
  });
});
