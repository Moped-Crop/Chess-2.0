/**
 * Chess 2 (ASCENT) — базовые типы игрового ядра.
 *
 * Это «словарь» движка: ниже описаны фигура, цвет, клетка, ход и полное
 * состояние партии. Здесь нет логики — только формы данных. Логика (генерация
 * ходов, легальность, эволюция) живёт в других файлах engine/.
 *
 * Конвенции координат — см. Rules_Clarification B8 и engine/board.ts.
 * Ядро engine/ НИКОГДА не импортирует ничего из app/, React или DOM.
 */

/** Сторона игрока. «Вперёд»: белые dr=+1, чёрные dr=−1 (B8). */
export type Color = 'white' | 'black';

/** Базовые типы фигур. ROO = Петух (Rooster). */
export type BasePieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'ROO';

/**
 * Эволюционные формы (B2). Каждая — отдельный тип: для повторения позиции (B7)
 * R ≠ R_RAM, ROO ≠ ROO_PHOENIX и т.д.
 *  - N_OUTRIDER / N_HUNTER   — формы Коня
 *  - B_PRELATE  / B_ZEALOT   — формы Слона
 *  - R_RAM      / R_ANCHOR   — формы Ладьи
 *  - ROO_PHOENIX             — форма Петуха
 */
export type EvolvedPieceType =
  | 'N_OUTRIDER'
  | 'N_HUNTER'
  | 'B_PRELATE'
  | 'B_ZEALOT'
  | 'R_RAM'
  | 'R_ANCHOR'
  | 'ROO_PHOENIX';

/** Любой тип фигуры — базовый или эволюционная форма. */
export type PieceType = BasePieceType | EvolvedPieceType;

/**
 * «Рабочие» базовые типы — только они эволюционируют по правилу E1 (B4).
 * Король и Ферзь не рабочие; пешка превращается, а не эволюционирует.
 */
export type WorkingPieceType = 'N' | 'B' | 'R' | 'ROO';

/** Допустимые цели превращения пешки (B4): обязателен выбор из пяти. */
export type PromotionType = 'Q' | 'R' | 'B' | 'N' | 'ROO';

/**
 * Фигура на доске.
 *  - hasMoved — ходила ли (для прав рокировки и двойного хода пешки).
 *  - evolved  — true у эволюционировавшей ИЛИ свежепревращённой фигуры; такая
 *               по E1 больше никогда не эволюционирует (B4).
 */
export interface Piece {
  type: PieceType;
  color: Color;
  hasMoved: boolean;
  evolved: boolean;
}

/**
 * Индекс клетки 0..79: s = rank*10 + file (10 файлов × 8 рангов, B8).
 * a1 = 0, j1 = 9, a8 = 70, j8 = 79. Белые внизу.
 */
export type Square = number;

/** Тип специального хода. */
export type SpecialMove = 'castle-king' | 'castle-queen' | 'enpassant';

/**
 * Полное описание одного хода. Один источник истины для UI и движка.
 *  - capture   — клетка снимаемой фигуры (для взятия на проходе ≠ to).
 *  - promotion — цель превращения пешки на последнем ранге (B4).
 *  - evolveTo  — выбранная форма при эволюции в зоне (B2/B4). Для N/B/R генератор
 *                выдаёт по ходу на каждую из двух форм; для ROO — Феникс.
 *  - special   — рокировка / взятие на проходе.
 */
export interface Move {
  from: Square;
  to: Square;
  capture?: Square;
  promotion?: PromotionType;
  evolveTo?: EvolvedPieceType;
  special?: SpecialMove;
}

/**
 * Права рокировки — какие из 4 ещё доступны (B5/B7).
 * king = в сторону файла j (kingside), queen = в сторону файла a (queenside).
 */
export interface CastlingRights {
  whiteKing: boolean;
  whiteQueen: boolean;
  blackKing: boolean;
  blackQueen: boolean;
}

/** Итог партии. 'white'/'black' — победа стороны; 'draw' — ничья. */
export type GameResult = 'ongoing' | 'white' | 'black' | 'draw';

/**
 * Полное неизменяемое состояние партии. applyMove(state, move) возвращает
 * НОВОЕ состояние, не мутируя это (Tech_Plan §4.5).
 *  - board         — массив длины 80; null = пустая клетка.
 *  - turn          — чья очередь ходить.
 *  - enPassant     — клетка, доступная для взятия на проходе, либо null.
 *  - halfmoveClock — полуходы без прогресса (B6); сброс на взятии/ходе пешкой/
 *                    эволюции; ничья при >= 150.
 *  - fullmove      — номер полного хода (растёт после хода чёрных).
 *  - history       — ключи позиций для троекратного повторения (B7).
 *  - result        — текущий итог; 'ongoing', пока партия идёт.
 */
export interface GameState {
  board: (Piece | null)[];
  turn: Color;
  castling: CastlingRights;
  enPassant: Square | null;
  halfmoveClock: number;
  fullmove: number;
  history: string[];
  result: GameResult;
}
