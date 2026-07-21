/**
 * applyMove(state, move) → НОВОЕ состояние (immutable reducer) — Tech_Plan §4.5.
 *
 * Порядок по B4: снять взятую фигуру → переместить → превращение пешки →
 * (эволюция — этап 11) → обновить права рокировки, поле e.p., счётчик (B6),
 * номер хода, очередь. Старое состояние НЕ мутируется.
 *
 * На текущем этапе НЕ реализованы: эволюция (B4 шаг 4) и спецходы (рокировка,
 * взятие на проходе) — добавляются в special.ts / evolution.ts (этапы 10–11).
 */

import type { CastlingRights, GameState, Move, Piece, Square } from './types';
import { forwardDir, isLastRank, offset, opposite, rankOf, sq } from './board';
import { positionKey } from './hash';

/** Снять права рокировки, если ходил король/ладья или съели ладью на углу (B5). */
function updateCastling(rights: CastlingRights, move: Move, moving: Piece): CastlingRights {
  const r = { ...rights };
  if (moving.type === 'K') {
    if (moving.color === 'white') {
      r.whiteKing = false;
      r.whiteQueen = false;
    } else {
      r.blackKing = false;
      r.blackQueen = false;
    }
  }
  if (moving.type === 'R') {
    if (move.from === sq(0, 0)) r.whiteQueen = false;
    if (move.from === sq(9, 0)) r.whiteKing = false;
    if (move.from === sq(0, 7)) r.blackQueen = false;
    if (move.from === sq(9, 7)) r.blackKing = false;
  }
  if (move.capture !== undefined) {
    if (move.capture === sq(0, 0)) r.whiteQueen = false;
    if (move.capture === sq(9, 0)) r.whiteKing = false;
    if (move.capture === sq(0, 7)) r.blackQueen = false;
    if (move.capture === sq(9, 7)) r.blackKing = false;
  }
  return r;
}

/**
 * Расстановка фигур после хода — БЕЗ прочего состояния (прав рокировки, поля
 * e.p., счётчиков, истории).
 *
 * Вынесено из applyMove ради одного важного потребителя: проверки легальности
 * (B1). Ей нужно знать ровно одно — не остался ли свой король под боем, а это
 * видно по одной доске. Полное состояние там строилось впустую, и дороже всего
 * обходился ключ позиции для правила о повторении: в переборе бота это
 * десятки тысяч выброшенных строк в секунду.
 *
 * Расстановка описана здесь ОДИН раз — applyMove пользуется этой же функцией.
 */
export function boardAfterMove(board0: (Piece | null)[], move: Move): (Piece | null)[] {
  const board = board0.slice();

  if (move.capture !== undefined) board[move.capture] = null;

  const p = board[move.from];
  if (p === null) throw new Error(`applyMove: no piece at from-square ${move.from}`);
  board[move.from] = null;

  if (p.type === 'P' && move.promotion !== undefined && isLastRank(move.to, p.color)) {
    // Превращение пешки (B4): свежая фигура evolved=true, по E1 не растёт.
    board[move.to] = { type: move.promotion, color: p.color, hasMoved: true, evolved: true };
  } else if (move.evolveTo !== undefined) {
    // Эволюция рабочей фигуры (B4 шаг 4).
    board[move.to] = { type: move.evolveTo, color: p.color, hasMoved: true, evolved: true };
  } else {
    board[move.to] = { ...p, hasMoved: true };
  }

  // Бастион (рокировка, B5): дополнительно переместить ладью.
  if (move.special === 'castle-king' || move.special === 'castle-queen') {
    const homeRank = p.color === 'white' ? 0 : 7;
    const rookFrom = sq(move.special === 'castle-king' ? 9 : 0, homeRank);
    const rookTo = sq(move.special === 'castle-king' ? 6 : 4, homeRank);
    const rook = board[rookFrom];
    if (rook === null) throw new Error('applyMove: castling rook missing');
    board[rookFrom] = null;
    board[rookTo] = { ...rook, hasMoved: true };
  }

  return board;
}

export function applyMove(state: GameState, move: Move): GameState {
  const p = state.board[move.from];
  if (p === null) throw new Error(`applyMove: no piece at from-square ${move.from}`);

  const board = boardAfterMove(state.board, move);
  // Эволюция считается состоявшейся только если ход не был превращением
  // пешки: по B4 они взаимно исключаются, превращение имеет приоритет.
  const promoted = p.type === 'P' && move.promotion !== undefined && isLastRank(move.to, p.color);
  const evolvedThisMove = !promoted && move.evolveTo !== undefined;

  const castling = updateCastling(state.castling, move, p);

  let enPassant: Square | null = null;
  if (p.type === 'P' && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
    enPassant = offset(move.from, 0, forwardDir(p.color)); // пропущенная клетка
  }

  // B6: счётчик сбрасывается при взятии, ходе пешкой или эволюции.
  const halfmoveClock =
    move.capture !== undefined || p.type === 'P' || evolvedThisMove
      ? 0
      : state.halfmoveClock + 1;

  const fullmove = state.turn === 'black' ? state.fullmove + 1 : state.fullmove;

  const next: GameState = {
    board,
    turn: opposite(state.turn),
    castling,
    enPassant,
    halfmoveClock,
    fullmove,
    history: state.history,
    result: state.result,
  };
  // Записать ключ новой позиции в историю (для троекратного повторения, B7).
  next.history = [...state.history, positionKey(next)];
  return next;
}
