/**
 * Тонкая обёртка над игровым движком для сервера. Движок импортируется
 * НАПРЯМУЮ из src/engine — на сервере нет отдельной реализации правил,
 * валидация ходов на 100% совпадает с клиентом.
 */

import { createInitialState, applyMove, legalMoves, computeResult } from '../src/engine';
import type { GameState, Move } from '../src/engine/types';

export function movesEqual(a: Move, b: Move): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.capture === b.capture &&
    a.promotion === b.promotion &&
    a.evolveTo === b.evolveTo &&
    a.special === b.special
  );
}

/** Состояние партии из списка ходов (как в БД): проигрываем с начала. */
export function reconstructState(moves: Move[]): GameState {
  let state = createInitialState();
  for (const m of moves) {
    const applied = applyMove(state, m);
    state = { ...applied, result: computeResult(applied) };
  }
  return state;
}

/**
 * Проверить и применить входящий ход. null — ход нелегален (или партия
 * уже закончена): сервер его отклоняет.
 */
export function tryApply(moves: Move[], incoming: Move): GameState | null {
  const state = reconstructState(moves);
  if (state.result !== 'ongoing') return null;
  const found = legalMoves(state).find((m) => movesEqual(m, incoming));
  if (!found) return null;
  const applied = applyMove(state, found);
  return { ...applied, result: computeResult(applied) };
}
