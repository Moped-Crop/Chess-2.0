/**
 * Ключ позиции для троекратного повторения — Rules_Clarification B7.
 *
 * Идентичность позиции = содержимое 80 клеток {тип(с формой), цвет} + очередь
 * хода + права рокировки + поле взятия на проходе. НЕ входят: halfmoveClock,
 * номер хода, флаг hasMoved (его влияние учтено через права рокировки).
 *
 * Эволюционная форма — отдельный тип (R ≠ R_RAM), поэтому позиция «после
 * эволюции» никогда не совпадёт с позицией «до» — ложных повторений нет.
 */

import type { GameState, Piece } from './types';

/** Уникальный код фигуры: цвет + тип (тип уже различает базу и формы). */
function pieceCode(p: Piece): string {
  return (p.color === 'white' ? 'w' : 'b') + p.type;
}

export function positionKey(state: GameState): string {
  let cells = '';
  for (let s = 0; s < state.board.length; s++) {
    const p = state.board[s];
    cells += (p ? pieceCode(p) : '-') + ',';
  }
  const c = state.castling;
  const castlingBits =
    (c.whiteKing ? '1' : '0') +
    (c.whiteQueen ? '1' : '0') +
    (c.blackKing ? '1' : '0') +
    (c.blackQueen ? '1' : '0');
  const ep = state.enPassant === null ? '-' : String(state.enPassant);
  return `${cells}|${state.turn}|${castlingBits}|${ep}`;
}
