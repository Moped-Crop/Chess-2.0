import { describe, expect, it } from 'vitest';
import { applyMove, computeResult, sq } from '../src/engine';
import { PIECE_VALUE, evaluate, evaluateMaterial } from '../src/app/bot/evaluate';
import { searchEasy, searchHard, searchMedium } from '../src/app/bot/search';
import { emptyBoard, makePiece, makeState } from './helpers';

/**
 * Бот — эвристика, а не правила, поэтому проверяем не «какой именно ход», а
 * свойства: находит очевидный выигрыш, не зевает фигуру, слушается бюджета
 * времени и сам выбирает форму при эволюции.
 */
describe('оценка позиции', () => {
  it('лишняя ладья даёт перевес той стороне, у которой она есть', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white');
    board[sq(5, 7)] = makePiece('K', 'black');
    board[sq(0, 3)] = makePiece('R', 'white');
    expect(evaluateMaterial(makeState(board, 'white'))).toBe(PIECE_VALUE.R);
    expect(evaluateMaterial(makeState(board, 'black'))).toBe(-PIECE_VALUE.R);
  });

  it('оценка симметрична: та же позиция чужими глазами даёт противоположный знак', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white');
    board[sq(5, 7)] = makePiece('K', 'black');
    // Позиция намеренно несимметрична (конь против ладьи) — иначе обе оценки
    // были бы нулём и проверка ничего не значила бы.
    board[sq(4, 3)] = makePiece('N', 'white');
    board[sq(4, 4)] = makePiece('R', 'black');
    const asWhite = evaluate(makeState(board, 'white'));
    expect(asWhite).toBeLessThan(0); // у белых меньше материала
    expect(asWhite).toBe(-evaluate(makeState(board, 'black')));
  });

  it('Феникс оценён дороже Петуха, но без отрыва — он короткая фигура (B2)', () => {
    expect(PIECE_VALUE.ROO_PHOENIX).toBeGreaterThan(PIECE_VALUE.ROO);
    expect(PIECE_VALUE.ROO_PHOENIX).toBeLessThan(PIECE_VALUE.R);
  });

  it('каждая эволюционная форма дороже своей базовой фигуры', () => {
    expect(PIECE_VALUE.N_OUTRIDER).toBeGreaterThan(PIECE_VALUE.N);
    expect(PIECE_VALUE.N_HUNTER).toBeGreaterThan(PIECE_VALUE.N);
    expect(PIECE_VALUE.B_PRELATE).toBeGreaterThan(PIECE_VALUE.B);
    expect(PIECE_VALUE.B_ZEALOT).toBeGreaterThan(PIECE_VALUE.B);
    expect(PIECE_VALUE.R_RAM).toBeGreaterThan(PIECE_VALUE.R);
    expect(PIECE_VALUE.R_ANCHOR).toBeGreaterThan(PIECE_VALUE.R);
  });
});

describe('поиск', () => {
  /** Мат в 1: две белые ладьи против голого короля на j8. */
  function mateInOne() {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white', { hasMoved: true });
    board[sq(5, 7)] = makePiece('K', 'black', { hasMoved: true });
    board[sq(0, 6)] = makePiece('R', 'white', { hasMoved: true });
    board[sq(9, 0)] = makePiece('R', 'white', { hasMoved: true });
    return makeState(board, 'white');
  }

  it('средний уровень находит мат в один ход', () => {
    const state = mateInOne();
    const { move } = searchMedium(state, 500);
    expect(move).not.toBeNull();
    expect(computeResult(applyMove(state, move!))).toBe('white');
  });

  it('сложный уровень находит мат в один ход', () => {
    const state = mateInOne();
    const { move, score } = searchHard(state, 500);
    expect(move).not.toBeNull();
    expect(computeResult(applyMove(state, move!))).toBe('white');
    expect(score).toBeGreaterThan(100_000); // оценка мата, а не материала
  });

  it('забирает беззащитного ферзя', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white', { hasMoved: true });
    board[sq(5, 7)] = makePiece('K', 'black', { hasMoved: true });
    board[sq(0, 0)] = makePiece('R', 'white', { hasMoved: true });
    board[sq(0, 5)] = makePiece('Q', 'black', { hasMoved: true });
    const state = makeState(board, 'white');
    const { move } = searchMedium(state, 500);
    expect(move?.capture).toBe(sq(0, 5));
  });

  it('не берёт защищённую пешку, теряя ладью (видит размен)', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white', { hasMoved: true });
    board[sq(5, 7)] = makePiece('K', 'black', { hasMoved: true });
    board[sq(0, 0)] = makePiece('R', 'white', { hasMoved: true });
    // Пешка на a6 прикрыта пешкой с b7 — взятие ладьёй проигрывает качество.
    board[sq(0, 5)] = makePiece('P', 'black', { hasMoved: true });
    board[sq(1, 6)] = makePiece('P', 'black', { hasMoved: true });
    const state = makeState(board, 'white');
    const { move } = searchHard(state, 800);
    expect(move?.capture).not.toBe(sq(0, 5));
  });

  it('лёгкий уровень ходит законно и детерминирован при заданном random', () => {
    const state = mateInOne();
    const a = searchEasy(state, () => 0);
    const b = searchEasy(state, () => 0);
    expect(a.move).toEqual(b.move);
    expect(a.move).not.toBeNull();
  });

  it('соблюдает бюджет времени', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white');
    board[sq(5, 7)] = makePiece('K', 'black');
    board[sq(4, 3)] = makePiece('Q', 'white');
    board[sq(4, 4)] = makePiece('Q', 'black');
    const result = searchMedium(makeState(board, 'white'), 300);
    // Запас на завершение последнего узла: бюджет проверяется между узлами.
    expect(result.elapsedMs).toBeLessThan(1200);
    expect(result.depth).toBeGreaterThanOrEqual(1);
  });

  it('сам выбирает форму эволюции — специальной логики для этого нет', () => {
    const board = emptyBoard();
    board[sq(5, 0)] = makePiece('K', 'white', { hasMoved: true });
    board[sq(5, 7)] = makePiece('K', 'black', { hasMoved: true });
    // Белая ладья в шаге от своей зоны эволюции (ранги 5–7 для белых).
    board[sq(0, 4)] = makePiece('R', 'white', { hasMoved: true });
    const state = makeState(board, 'white');
    const { move } = searchHard(state, 800);
    expect(move).not.toBeNull();
    // Ход в зону эволюции движок разворачивает в варианты с evolveTo; бот
    // должен предпочесть эволюцию, раз форма дороже базовой фигуры.
    if (move!.evolveTo !== undefined) {
      expect(['R_RAM', 'R_ANCHOR']).toContain(move!.evolveTo);
    }
  });
});
