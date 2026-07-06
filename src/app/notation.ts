/**
 * Запись хода для панели истории. Глиф фигуры рисуется отдельно (см. MovesTab),
 * поэтому текст содержит только координаты и пометки:
 *   b1–c3      обычный ход (откуда–куда)
 *   a1×a5      взятие (×)
 *   O-O/O-O-O  рокировка (Бастион)
 *   a7–a8=Ф    превращение
 *   d4–e6→Лв   эволюция в форму
 *   …+  / …#   шах / мат
 */

import type { Color, GameState, Move, PieceType } from '../engine/types';
import { squareName, isKingInCheck } from '../engine';
import { PIECE_LABEL } from './pieceMeta';

/** Один сыгранный полуход для панели истории. */
export interface MoveEntry {
  color: Color;
  pieceType: PieceType;
  san: string;
}

function withSuffix(text: string, after: GameState): string {
  if (!isKingInCheck(after.board, after.turn)) return text;
  const mate = after.result === 'white' || after.result === 'black';
  return text + (mate ? '#' : '+');
}

/** Текстовая запись хода без буквы фигуры (буква заменяется иконкой в UI). */
export function moveSan(move: Move, after: GameState): string {
  if (move.special === 'castle-king') return withSuffix('O-O', after);
  if (move.special === 'castle-queen') return withSuffix('O-O-O', after);

  const sep = move.capture !== undefined ? '×' : '–';
  let text = `${squareName(move.from)}${sep}${squareName(move.to)}`;
  if (move.special === 'enpassant') text += ' e.p.';
  if (move.promotion) text += '=' + PIECE_LABEL[move.promotion];
  if (move.evolveTo) text += '→' + PIECE_LABEL[move.evolveTo];
  return withSuffix(text, after);
}
