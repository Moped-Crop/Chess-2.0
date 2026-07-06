/**
 * Эволюция рабочих фигур — Rules_Clarification B4/B8 (+E1, A10).
 *
 * Рабочая фигура (Конь/Слон/Ладья/Петух) с evolved=false, завершая ход в своей
 * зоне эволюции, превращается в форму — одноразово и необратимо. Эволюция не
 * стэкается с превращением (B4) и может давать шах (B1 — без спец-ограничений).
 *
 * Здесь — только триггер и разворот ходов в варианты с выбором формы. Сама
 * замена фигуры на форму выполняется в applyMove (B4 шаг 4) по полю move.evolveTo.
 */

import type { EvolvedPieceType, Move, Piece, PieceType, Square } from './types';
import { rankOf } from './board';

/** Базовые «рабочие» типы — только они эволюционируют по E1. */
export function isWorking(type: PieceType): boolean {
  return type === 'N' || type === 'B' || type === 'R' || type === 'ROO';
}

/** Лежит ли клетка to в зоне эволюции данной фигуры (B8). */
export function inEvoZone(to: Square, piece: Piece): boolean {
  const r = rankOf(to);
  if (piece.type === 'ROO') {
    return piece.color === 'white' ? r === 6 || r === 7 : r === 0 || r === 1;
  }
  // N, B, R
  return piece.color === 'white' ? r >= 5 && r <= 7 : r >= 0 && r <= 2;
}

const FORMS: Record<string, EvolvedPieceType[]> = {
  N: ['N_OUTRIDER', 'N_HUNTER'],
  B: ['B_PRELATE', 'B_ZEALOT'],
  R: ['R_RAM', 'R_ANCHOR'],
  ROO: ['ROO_PHOENIX'],
};

/** Допустимые формы для базового рабочего типа (N/B/R → 2; ROO → 1). */
export function evolutionFormsFor(type: PieceType): EvolvedPieceType[] {
  return FORMS[type] ?? [];
}

/**
 * Развернуть ходы рабочей фигуры: ход, заканчивающийся в зоне, превращается в
 * по одному ходу-кандидату на каждую допустимую форму (с полем evolveTo).
 * Ходы вне зоны и ходы уже эволюционировавшей/нерабочей фигуры — без изменений.
 */
export function expandEvolution(piece: Piece, moves: Move[]): Move[] {
  if (!isWorking(piece.type) || piece.evolved) return moves;
  const forms = evolutionFormsFor(piece.type);
  const out: Move[] = [];
  for (const m of moves) {
    if (inEvoZone(m.to, piece)) {
      for (const form of forms) out.push({ ...m, evolveTo: form });
    } else {
      out.push(m);
    }
  }
  return out;
}
