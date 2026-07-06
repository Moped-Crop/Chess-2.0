/**
 * Терминальные состояния партии — мат, пат, ничьи (Tech_Plan §4.4).
 *
 * Это НЕ часть applyMove: вычисление итога требует генерации легальных ходов,
 * поэтому считается отдельно (слоем матча) после хода — иначе была бы рекурсия
 * applyMove → legalMoves → applyMove.
 */

import type { GameResult, GameState, Piece } from './types';
import { opposite } from './board';
import { isKingInCheck, legalMoves } from './legality';

/** Мат: сторона под шахом и не имеет легальных ходов. */
export function isCheckmate(state: GameState): boolean {
  return isKingInCheck(state.board, state.turn) && legalMoves(state).length === 0;
}

/** Пат: сторона НЕ под шахом и не имеет легальных ходов → ничья (MVP). */
export function isStalemate(state: GameState): boolean {
  return !isKingInCheck(state.board, state.turn) && legalMoves(state).length === 0;
}

/** B6: ничья при 150 полуходах без прогресса (взятия/хода пешкой/эволюции). */
export function isSeventyFiveMoveRule(state: GameState): boolean {
  return state.halfmoveClock >= 150;
}

/** B7: текущая позиция встречалась >= 3 раз (по ключам в state.history). */
export function isThreefoldRepetition(state: GameState): boolean {
  const h = state.history;
  if (h.length === 0) return false;
  const key = h[h.length - 1];
  let count = 0;
  for (const k of h) if (k === key) count++;
  return count >= 3;
}

/**
 * Недостаток материала — консервативная заглушка (Pre-Code Audit §4):
 * ничья только в очевидных случаях — K vs K и K vs K + одинокий неэволюц. лёгкий.
 */
export function isInsufficientMaterial(board: (Piece | null)[]): boolean {
  const others: Piece[] = [];
  for (const p of board) {
    if (p && p.type !== 'K') others.push(p);
  }
  if (others.length === 0) return true; // K vs K
  if (others.length === 1 && (others[0].type === 'N' || others[0].type === 'B')) return true;
  return false;
}

/** Полный итог позиции: 'white'/'black' (победа), 'draw' или 'ongoing'. */
export function computeResult(state: GameState): GameResult {
  if (legalMoves(state).length === 0) {
    return isKingInCheck(state.board, state.turn) ? opposite(state.turn) : 'draw';
  }
  if (isSeventyFiveMoveRule(state)) return 'draw';
  if (isThreefoldRepetition(state)) return 'draw';
  if (isInsufficientMaterial(state.board)) return 'draw';
  return 'ongoing';
}
