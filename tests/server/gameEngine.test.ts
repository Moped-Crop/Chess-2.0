/**
 * Серверная обёртка движка: восстановление позиции из списка ходов,
 * применение легального хода, отклонение нелегального.
 */

import { describe, it, expect } from 'vitest';
import { reconstructState, tryApply, movesEqual } from '../../server/gameEngine';
import { sq } from '../../src/engine/board';
import type { Move } from '../../src/engine/types';

const E2E4: Move = { from: sq(4, 1), to: sq(4, 3) };
const E7E5: Move = { from: sq(4, 6), to: sq(4, 4) };

describe('reconstructState', () => {
  it('replays moves to the same position', () => {
    const s = reconstructState([E2E4, E7E5]);
    expect(s.turn).toBe('white');
    expect(s.board[sq(4, 3)]?.type).toBe('P');
    expect(s.board[sq(4, 4)]?.color).toBe('black');
    expect(s.board[sq(4, 1)]).toBeNull();
  });
});

describe('tryApply', () => {
  it('applies a legal move', () => {
    const next = tryApply([], E2E4);
    expect(next).not.toBeNull();
    expect(next!.turn).toBe('black');
  });

  it('rejects an illegal move (rook jump through pawn)', () => {
    const bad: Move = { from: sq(0, 0), to: sq(0, 4) }; // ладья сквозь пешку a2
    expect(tryApply([], bad)).toBeNull();
  });

  it('rejects a move out of turn', () => {
    // Чёрные пытаются сходить первым ходом.
    expect(tryApply([], E7E5)).toBeNull();
  });

  it('rejects a fabricated capture flag', () => {
    const fake: Move = { from: sq(4, 1), to: sq(4, 3), capture: sq(4, 6) };
    expect(tryApply([], fake)).toBeNull();
  });
});

describe('movesEqual', () => {
  it('distinguishes evolution variants', () => {
    const a: Move = { from: 0, to: 10, evolveTo: 'R_RAM' };
    const b: Move = { from: 0, to: 10, evolveTo: 'R_ANCHOR' };
    expect(movesEqual(a, b)).toBe(false);
    expect(movesEqual(a, { ...a })).toBe(true);
  });
});
