/**
 * Оценка позиции для бота. Шкала — сотые доли пешки, знак всегда с точки
 * зрения стороны, чей сейчас ход (конвенция негамакса).
 *
 * Это ЭВРИСТИКА, а не правила: движок (engine/) остаётся единственным
 * источником истины о том, что законно, — здесь только «насколько хорошо».
 */

import type { Color, GameState, Piece, PieceType, Square } from '../../engine/types';
import { BOARD_SIZE, RANK_COUNT, attacksFrom, fileOf, offset, rankOf } from '../../engine';

/**
 * Цена фигур в сотых пешки.
 *
 * Классика — стандартная шкала. Для фигур Chess 2 прямого аналога нет, поэтому
 * числа выведены из реальной таблицы движений (Rules_Clarification B2/B3) и
 * заведомо приблизительны — их место уточняется по сыгранным партиям.
 *
 *  - ROO: forward-луч (дальнобойный, но только вперёд) + 2 диагонали-вперёд на
 *    взятие. Не отступает вообще — половина манёвренности ладьи, отсюда ~конь.
 *  - N_OUTRIDER (N+Wazir) / N_HUNTER (N+Ferz): конь + 4 шага; лишние 4 поля
 *    закрывают главную слабость коня — потерю темпа на перестановку.
 *  - B_PRELATE (слайдер-диагональ + Wazir): сильнейшая из лёгких форм — ходом
 *    на соседнюю ортогональ слон перестаёт быть привязан к своему цвету полей.
 *  - B_ZEALOT (слайдер-диагональ + Alfil): Alfil прыгает на те же поля своего
 *    цвета, что и так покрыты, — прибавка только в перепрыгивании заслона.
 *  - R_RAM (слайдер-ортогональ + Dabbaba): ладья, умеющая перепрыгнуть заслон.
 *  - R_ANCHOR (слайдер-ортогональ + Ferz БЕЗ взятия): диагональный шаг не
 *    атакует вовсе — прибавка только к манёвру, поэтому дешевле Тарана.
 *  - ROO_PHOENIX: ВНИМАНИЕ — по таблице B2 это короткая фигура: ход на 1 клетку
 *    по 4 ортогоналям, взятие только forward-1 и 2 диагонали-вперёд (атакует
 *    ровно 3 поля). В обмен на дальнобойный луч Петух получает право отступать.
 *    Поэтому Феникс оценён лишь чуть дороже Петуха, а не в полтора раза.
 */
export const PIECE_VALUE: Record<PieceType, number> = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 0, // король бесценен: его судьба выражается матовыми оценками в поиске
  ROO: 300,

  N_OUTRIDER: 420,
  N_HUNTER: 410,
  B_PRELATE: 460,
  B_ZEALOT: 380,
  R_RAM: 560,
  R_ANCHOR: 540,
  ROO_PHOENIX: 340,
};

/**
 * Бонус за центр, посчитанный один раз на модуль.
 *
 * «Центр» взят пропорционально доске 10×8, а не скопирован с 8×8: по файлам
 * центральные — e/f (индексы 4–5), расширенный центр d..g (3–6); по рангам
 * центральные 4–5 (индексы 3–4), расширенный 3–6 (индексы 2–5).
 */
const CENTER_BONUS: number[] = (() => {
  const table = new Array<number>(BOARD_SIZE).fill(0);
  for (let s = 0; s < BOARD_SIZE; s++) {
    const f = fileOf(s);
    const r = rankOf(s);
    const coreFile = f >= 4 && f <= 5;
    const coreRank = r >= 3 && r <= 4;
    const wideFile = f >= 3 && f <= 6;
    const wideRank = r >= 2 && r <= 5;
    if (coreFile && coreRank) table[s] = 14;
    else if (wideFile && wideRank) table[s] = 7;
    else if (wideFile || wideRank) table[s] = 2;
  }
  return table;
})();

/** Бонус пешке за продвижение: чем ближе к превращению, тем дороже. */
function pawnAdvance(s: Square, color: Color): number {
  const r = rankOf(s);
  const advanced = color === 'white' ? r - 1 : RANK_COUNT - 2 - r;
  return advanced > 0 ? advanced * advanced : 0;
}

/** Пешечное прикрытие короля: свои пешки на соседних клетках спереди и сбоку. */
function kingShield(board: (Piece | null)[], king: Square, color: Color): number {
  const dr = color === 'white' ? 1 : -1;
  let shield = 0;
  for (const df of [-1, 0, 1] as const) {
    for (const dd of [0, dr] as const) {
      if (df === 0 && dd === 0) continue;
      const t = offset(king, df, dd);
      if (t === null) continue;
      const p = board[t];
      if (p && p.color === color && p.type === 'P') shield += 1;
    }
  }
  return shield * 10;
}

/** Сумма материала стороны — без позиционных добавок. */
export function materialFor(board: (Piece | null)[], color: Color): number {
  let total = 0;
  for (let s = 0; s < BOARD_SIZE; s++) {
    const p = board[s];
    if (p !== null && p.color === color) total += PIECE_VALUE[p.type];
  }
  return total;
}

/**
 * Только материал, с точки зрения стороны, чей ход. Используется лёгким уровнем
 * — он специально не должен видеть ничего, кроме размена.
 */
export function evaluateMaterial(state: GameState): number {
  const me = state.turn;
  const them: Color = me === 'white' ? 'black' : 'white';
  return materialFor(state.board, me) - materialFor(state.board, them);
}

/**
 * Полная оценка: материал + центр + продвижение пешек + подвижность +
 * прикрытие короля. Знак — с точки зрения стороны, чей сейчас ход.
 *
 * Всё считается за один проход по доске: движок и так недёшев, лишние обходы
 * прямо режут глубину поиска.
 */
export function evaluate(state: GameState): number {
  const board = state.board;
  const me = state.turn;
  let score = 0;
  let whiteKing: Square | null = null;
  let blackKing: Square | null = null;

  for (let s = 0; s < BOARD_SIZE; s++) {
    const p = board[s];
    if (p === null) continue;
    const sign = p.color === me ? 1 : -1;

    let value = PIECE_VALUE[p.type];
    if (p.type === 'K') {
      if (p.color === 'white') whiteKing = s;
      else blackKing = s;
    } else if (p.type === 'P') {
      value += pawnAdvance(s, p.color) + CENTER_BONUS[s] / 2;
    } else {
      value += CENTER_BONUS[s];
      // Подвижность — по числу атакуемых полей. Дёшево (одна выборка на
      // фигуру) и достаточно для эвристики: правил это не касается.
      value += attacksFrom(p, s, board).length;
    }
    score += sign * value;
  }

  if (whiteKing !== null) {
    score += (me === 'white' ? 1 : -1) * kingShield(board, whiteKing, 'white');
  }
  if (blackKing !== null) {
    score += (me === 'black' ? 1 : -1) * kingShield(board, blackKing, 'black');
  }

  return score;
}
