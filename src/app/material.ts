/**
 * Ценность фигур для счётчика материала (предварительные номиналы из GDD;
 * формы — сайдгрейды, ≈ ценности базы). Точные числа — на плейтест.
 */

import type { Color, Piece, PieceType } from '../engine/types';

export const PIECE_VALUE: Record<PieceType, number> = {
  K: 0,
  Q: 9,
  R: 5,
  B: 3,
  N: 3,
  P: 1,
  ROO: 4,
  N_OUTRIDER: 3,
  N_HUNTER: 3,
  B_PRELATE: 3,
  B_ZEALOT: 3,
  R_RAM: 5,
  R_ANCHOR: 5,
  ROO_PHOENIX: 4,
};

/** Фигуры, взятые стороной `capturer` (т.е. фигуры соперника из списка взятий). */
export function capturedBy(captures: (Piece | null)[], capturer: Color): Piece[] {
  return captures.filter((p): p is Piece => p !== null && p.color !== capturer);
}

export function materialScore(pieces: Piece[]): number {
  return pieces.reduce((sum, p) => sum + PIECE_VALUE[p.type], 0);
}
