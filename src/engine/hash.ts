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

import type { GameState, PieceType } from './types';

/**
 * Код фигуры — РОВНО ОДИН символ (белые заглавной, чёрные строчной). Раньше
 * писался человекочитаемый «wN_OUTRIDER,» и ключ занимал под 240 символов;
 * теперь клетка — один символ, разделители не нужны, и ключ ровно 80 символов.
 *
 * Зачем: applyMove строит этот ключ на КАЖДЫЙ ход (он нужен для правила о
 * троекратном повторении, B7), а бот вызывает applyMove десятки тысяч раз в
 * секунду — построение строки было самой дорогой частью хода.
 *
 * Содержимое ключа сравнивается только с другими такими же ключами, поэтому
 * формат — деталь реализации. Единственный видимый след: партия, сохранённая
 * ДО обновления и продолженная после, в пределах этой партии не сопоставит
 * старые ключи с новыми (повторение отсчитается заново). Ради этого стирать
 * пользователям сохранённые партии не стоит.
 */
const TYPE_CODE: Record<PieceType, string> = {
  K: 'k',
  Q: 'q',
  R: 'r',
  B: 'b',
  N: 'n',
  P: 'p',
  ROO: 'o',
  N_OUTRIDER: 'd',
  N_HUNTER: 'h',
  B_PRELATE: 'l',
  B_ZEALOT: 'z',
  R_RAM: 'm',
  R_ANCHOR: 'a',
  ROO_PHOENIX: 'x',
};

/** Готовые таблицы «тип → символ» по цветам: без вызовов toUpperCase в цикле. */
const WHITE_CODE = {} as Record<PieceType, string>;
const BLACK_CODE = {} as Record<PieceType, string>;
for (const [type, code] of Object.entries(TYPE_CODE) as [PieceType, string][]) {
  WHITE_CODE[type] = code.toUpperCase();
  BLACK_CODE[type] = code;
}

export function positionKey(state: GameState): string {
  let cells = '';
  for (let s = 0; s < state.board.length; s++) {
    const p = state.board[s];
    cells += p === null ? '.' : p.color === 'white' ? WHITE_CODE[p.type] : BLACK_CODE[p.type];
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
