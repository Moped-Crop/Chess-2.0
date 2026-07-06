/**
 * Генерация ходов эволюционных форм — Rules_Clarification B2.
 *
 * У большинства форм множество ходов совпадает с множеством атак (см.
 * attacks.ts) → используем общий targetsToMoves. Исключения:
 *  - R_ANCHOR (Опора): дополнительно Ferz-ШАГ только на пустую (без взятия/атаки).
 *  - ROO_PHOENIX (Феникс): ход — Wazir на пустую (4 ортогонали, включая назад);
 *    взятие — forward 1 прямо + 2 диагонали-вперёд.
 */

import type { Move, Piece, Square } from '../types';
import type { Color } from '../types';
import { forwardDir, offset } from '../board';
import { WAZIR, FERZ } from '../attacks';
import { targetsToMoves } from './classic';

function phoenixMoves(from: Square, color: Color, board: (Piece | null)[]): Move[] {
  const moves: Move[] = [];
  const dr = forwardDir(color);

  // Ход на пустую: Wazir в любую из 4 ортогональных сторон (включая назад/вбок).
  for (const [df, dd] of WAZIR) {
    const t = offset(from, df, dd);
    if (t !== null && board[t] === null) moves.push({ from, to: t });
  }
  // Взятие прямо вперёд на 1.
  const f1 = offset(from, 0, dr);
  if (f1 !== null) {
    const occ = board[f1];
    if (occ && occ.color !== color) moves.push({ from, to: f1, capture: f1 });
  }
  // Взятие по двум диагоналям-вперёд на 1.
  for (const df of [-1, 1] as const) {
    const d = offset(from, df, dr);
    if (d !== null) {
      const occ = board[d];
      if (occ && occ.color !== color) moves.push({ from, to: d, capture: d });
    }
  }
  return moves;
}

export function evolvedMoves(piece: Piece, from: Square, board: (Piece | null)[]): Move[] {
  switch (piece.type) {
    case 'N_OUTRIDER':
    case 'N_HUNTER':
    case 'B_PRELATE':
    case 'B_ZEALOT':
    case 'R_RAM':
      return targetsToMoves(piece, from, board);
    case 'R_ANCHOR': {
      const moves = targetsToMoves(piece, from, board); // слайдер по ортогоналям (ход+взятие)
      for (const [df, dr] of FERZ) {
        const t = offset(from, df, dr);
        if (t !== null && board[t] === null) moves.push({ from, to: t }); // Ferz только на пустую
      }
      return moves;
    }
    case 'ROO_PHOENIX':
      return phoenixMoves(from, piece.color, board);
    default:
      throw new Error(`evolvedMoves: not an evolved form: ${piece.type}`);
  }
}
