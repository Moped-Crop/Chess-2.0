/**
 * Спецходы: Бастион (рокировка, B5) и взятие на проходе.
 *
 * Эти ходы генерируются отдельно и добавляются в общий список псевдо-легальных
 * (см. moveGen.ts). Бастион генерируется уже полностью легальным (проверка
 * битых полей по B5); e.p. — псевдо-легальным (общий фильтр короля в legality.ts
 * отсеет редкий «вскрытый шах» после e.p.).
 */

import type { GameState, Move } from './types';
import { forwardDir, offset, opposite, sq } from './board';
import { isSquareAttackedBy } from './attacks';

/** Ходы взятия на проходе для стороны, чей сейчас ход. */
export function generateEnPassant(state: GameState): Move[] {
  const target = state.enPassant;
  if (target === null) return [];
  const color = state.turn;
  const dr = forwardDir(color);
  const board = state.board;
  // Вражеская пешка, сделавшая двойной ход, стоит «за» полем e.p. (на 1 назад от него).
  const captured = offset(target, 0, -dr);
  if (captured === null || board[captured] === null) return [];

  const moves: Move[] = [];
  for (const df of [-1, 1] as const) {
    const x = offset(target, df, -dr); // клетка-кандидат бьющей пешки
    if (x === null) continue;
    const p = board[x];
    if (p && p.color === color && p.type === 'P') {
      moves.push({ from: x, to: target, capture: captured, special: 'enpassant' });
    }
  }
  return moves;
}

interface CastleDef {
  side: 'castle-king' | 'castle-queen';
  hasRight: (s: GameState) => boolean;
  rookFromFile: number;
  betweenFiles: number[]; // строго между Королём и Ладьёй — должны быть пусты
  kingPathFiles: number[]; // старт, проходные и финальная клетка Короля — не под боем
  kingToFile: number;
}

/** Ходы Бастиона (рокировки) для стороны, чей сейчас ход — полностью легальные (B5). */
export function generateCastling(state: GameState): Move[] {
  const color = state.turn;
  const r = color === 'white' ? 0 : 7;
  const board = state.board;
  const enemy = opposite(color);

  const kingFrom = sq(5, r);
  const king = board[kingFrom];
  if (!king || king.type !== 'K' || king.color !== color) return [];

  const defs: CastleDef[] = [
    {
      side: 'castle-king',
      hasRight: (s) => (color === 'white' ? s.castling.whiteKing : s.castling.blackKing),
      rookFromFile: 9,
      betweenFiles: [6, 7, 8],
      kingPathFiles: [5, 6, 7],
      kingToFile: 7,
    },
    {
      side: 'castle-queen',
      hasRight: (s) => (color === 'white' ? s.castling.whiteQueen : s.castling.blackQueen),
      rookFromFile: 0,
      betweenFiles: [4, 3, 2, 1],
      kingPathFiles: [5, 4, 3],
      kingToFile: 3,
    },
  ];

  const moves: Move[] = [];
  for (const d of defs) {
    if (!d.hasRight(state)) continue;
    const rook = board[sq(d.rookFromFile, r)];
    if (!rook || rook.type !== 'R' || rook.color !== color) continue;
    if (d.betweenFiles.some((f) => board[sq(f, r)] !== null)) continue;
    if (d.kingPathFiles.some((f) => isSquareAttackedBy(board, sq(f, r), enemy))) continue;
    moves.push({ from: kingFrom, to: sq(d.kingToFile, r), special: d.side });
  }
  return moves;
}

/** Все спецходы стороны state.turn. */
export function generateSpecialMoves(state: GameState): Move[] {
  return [...generateCastling(state), ...generateEnPassant(state)];
}
