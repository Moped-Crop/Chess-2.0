/**
 * Поиск хода для бота: негамакс с альфа-бетой и итеративным углублением.
 *
 * Негамакс — та же минимаксная идея, записанная короче: оценка ВСЕГДА берётся
 * с точки зрения стороны, чей сейчас ход, а при спуске в рекурсию меняется
 * знак. Так не нужно писать две симметричные ветки «максимизируем/минимизируем».
 *
 * Бюджет задан по ВРЕМЕНИ, а не фиксированной глубиной: доска 10×8 даёт очень
 * разное ветвление в разных позициях (в начале — под сотню ходов, в эндшпиле —
 * десяток), и одна и та же глубина стоила бы то доли секунды, то минуту.
 * Ищем глубину 1, потом 2, 3… и отдаём лучший ход последней ПОЛНОСТЬЮ
 * досчитанной глубины.
 *
 * Правил тут нет: любые ходы берутся у движка через legalMoves() — включая
 * эволюцию и превращение, которые движок уже разворачивает в отдельные
 * ходы-кандидаты. Поэтому «какую форму выбрать» бот решает обычным перебором,
 * без единой строчки специальной логики.
 */

import type { GameState, Move, Square } from '../../engine/types';
import {
  applyMove,
  isInsufficientMaterial,
  isKingInCheck,
  isSeventyFiveMoveRule,
  isThreefoldRepetition,
  legalMoves,
  positionKey,
} from '../../engine';
import { PIECE_VALUE, evaluate, evaluateMaterial } from './evaluate';

/** Оценка мата. Не Infinity: конечное число безопасно складывать и сравнивать. */
const MATE = 1_000_000;
/** Порог, выше которого оценка означает «мат в N ходов». */
const MATE_THRESHOLD = MATE - 1000;

/** Насколько глубоко продолжать «тихий» поиск взятий за границей глубины. */
const MAX_QUIESCENCE_PLY = 6;

export interface SearchResult {
  move: Move | null;
  score: number;
  /** Последняя ПОЛНОСТЬЮ досчитанная глубина. */
  depth: number;
  nodes: number;
  elapsedMs: number;
}

interface Options {
  budgetMs: number;
  /** Кэш уже оценённых позиций (таблица перестановок). */
  useTT: boolean;
  /** Killer-эвристика: ходы, вызвавшие отсечение на этой же глубине. */
  useKillers: boolean;
  /** «Тихий» поиск взятий на границе глубины — лечит эффект горизонта. */
  useQuiescence: boolean;
  /** Потолок глубины: страховка от бесконечного углубления в пустой позиции. */
  maxDepth: number;
}

type TTFlag = 'exact' | 'lower' | 'upper';

interface TTEntry {
  depth: number;
  score: number;
  flag: TTFlag;
}

/**
 * Ключ позиции для кэша. Движок УЖЕ положил его последним элементом history
 * (это делает applyMove для правила о троекратном повторении), поэтому обычно
 * достаточно взять готовое — пересчитывать строку из 80 клеток не нужно.
 */
function keyOf(state: GameState): string {
  return state.history.length > 0 ? state.history[state.history.length - 1] : positionKey(state);
}

/** Приоритет хода при сортировке: чем больше, тем раньше он будет просмотрен. */
function moveScore(state: GameState, move: Move, killers: (Move | null)[]): number {
  let score = 0;
  if (move.capture !== undefined) {
    const victim = state.board[move.capture];
    const attacker = state.board[move.from];
    // MVV-LVA: сначала пробуем взять фигуру подороже фигурой подешевле.
    score =
      100_000 +
      (victim ? PIECE_VALUE[victim.type] : 0) -
      (attacker ? PIECE_VALUE[attacker.type] / 10 : 0);
  } else if (killers.length > 0) {
    for (const k of killers) {
      if (k && k.from === move.from && k.to === move.to) {
        score = 90_000;
        break;
      }
    }
  }
  // Превращение и эволюция резко меняют материал — смотреть их стоит рано.
  if (move.promotion !== undefined) score += PIECE_VALUE[move.promotion];
  if (move.evolveTo !== undefined) score += PIECE_VALUE[move.evolveTo];
  return score;
}

function sortMoves(state: GameState, moves: Move[], killers: (Move | null)[]): Move[] {
  return moves
    .map((m) => ({ m, s: moveScore(state, m, killers) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

/** Внутреннее состояние одного запуска поиска. */
class Search {
  nodes = 0;
  private deadline = 0;
  private aborted = false;
  private tt = new Map<string, TTEntry>();
  private killers: (Move | null)[][] = [];

  constructor(private readonly opts: Options) {}

  /** Проверка времени — раз в 512 узлов: Date.now() на каждом узле сам по себе дорог. */
  private outOfTime(): boolean {
    if (this.aborted) return true;
    if ((this.nodes & 511) === 0 && Date.now() >= this.deadline) this.aborted = true;
    return this.aborted;
  }

  /**
   * «Тихий» поиск: досматриваем только взятия, пока позиция не успокоится.
   * Без него бот регулярно ошибается ровно на границе глубины — видит, что
   * забрал ферзя, и не видит, что его тут же забирают в ответ.
   */
  private quiescence(
    state: GameState,
    alpha: number,
    beta: number,
    qply: number,
    ply: number,
    lastTo: Square | null,
  ): number {
    this.nodes++;
    if (this.outOfTime()) return 0;

    // ОДИН вызов legalMoves на узел: он же даёт и терминальную проверку, и
    // список взятий. Генерация ходов здесь — самая дорогая операция во всём
    // поиске, второй вызов на том же узле удваивал бы стоимость листа.
    const moves = legalMoves(state);
    if (moves.length === 0) {
      return isKingInCheck(state.board, state.turn) ? -(MATE - ply) : 0;
    }

    const standPat = evaluate(state);
    if (qply >= MAX_QUIESCENCE_PLY) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    // ТОЛЬКО взятия-ответы на ту же клетку. Просмотр вообще всех взятий на
    // этой доске съедает весь бюджет (проверено замером: глубина падала с 3
    // до 1), а лечить надо ровно один случай — «забрал и не увидел, что
    // забирают в ответ». Размен на одном поле это и есть.
    if (lastTo === null) return standPat;
    const recaptures = moves.filter((m) => m.capture !== undefined && m.to === lastTo);
    for (const move of sortMoves(state, recaptures, [])) {
      const score = -this.quiescence(
        applyMove(state, move),
        -beta,
        -alpha,
        qply + 1,
        ply + 1,
        move.to,
      );
      if (this.aborted) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  private negamax(
    state: GameState,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    lastTo: Square | null,
  ): number {
    this.nodes++;
    if (this.outOfTime()) return 0;

    const alphaOrig = alpha;
    const key = this.opts.useTT ? keyOf(state) : '';
    if (this.opts.useTT) {
      const hit = this.tt.get(key);
      if (hit && hit.depth >= depth) {
        if (hit.flag === 'exact') return hit.score;
        if (hit.flag === 'lower' && hit.score > alpha) alpha = hit.score;
        else if (hit.flag === 'upper' && hit.score < beta) beta = hit.score;
        if (alpha >= beta) return hit.score;
      }
    }

    // Лист дерева. Проверку на мат/пат делаем НЕ здесь, а внутри quiescence —
    // иначе на самом массовом типе узлов legalMoves вызывался бы дважды.
    if (depth <= 0 && this.opts.useQuiescence) {
      return this.quiescence(state, alpha, beta, 0, ply, lastTo);
    }

    // Терминальные позиции определяем ЗДЕСЬ, а не через computeResult(): та
    // заново вызывает legalMoves, а он у нас уже сгенерирован.
    const moves = legalMoves(state);
    if (moves.length === 0) {
      // Мат тем ближе, чем меньше ply, — так бот предпочтёт мат в 2 мату в 5.
      return isKingInCheck(state.board, state.turn) ? -(MATE - ply) : 0;
    }
    if (
      isSeventyFiveMoveRule(state) ||
      isInsufficientMaterial(state.board) ||
      // Повторение внутри просчитываемой линии — тоже ничья. Стоит одного
      // прохода по history против ~110 мкс на генерацию ходов, то есть почти
      // ничего, а без него бот с решающим перевесом зашаркивал партию в
      // ничью (проверено дуэлью сложный–средний: было 31:15 и ничья).
      isThreefoldRepetition(state)
    ) {
      return 0;
    }

    if (depth <= 0) return evaluate(state);

    if (this.opts.useKillers && this.killers[ply] === undefined) this.killers[ply] = [null, null];
    const killers = this.opts.useKillers ? this.killers[ply] : [];

    let best = -MATE;
    for (const move of sortMoves(state, moves, killers)) {
      const score = -this.negamax(
        applyMove(state, move),
        depth - 1,
        -beta,
        -alpha,
        ply + 1,
        move.to,
      );
      if (this.aborted) return 0;
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        // Отсечение: этот ход настолько хорош, что соперник в эту ветку не
        // пойдёт. Запоминаем его как killer — на той же глубине в соседних
        // ветках он часто срабатывает снова.
        if (this.opts.useKillers && move.capture === undefined) {
          killers[1] = killers[0];
          killers[0] = move;
        }
        break;
      }
    }

    if (this.opts.useTT) {
      const flag: TTFlag = best <= alphaOrig ? 'upper' : best >= beta ? 'lower' : 'exact';
      this.tt.set(key, { depth, score: best, flag });
    }
    return best;
  }

  /** Итеративное углубление: 1, 2, 3… пока не кончится бюджет времени. */
  run(state: GameState): SearchResult {
    const started = Date.now();
    this.deadline = started + this.opts.budgetMs;

    const rootMoves = legalMoves(state);
    if (rootMoves.length === 0) {
      return { move: null, score: 0, depth: 0, nodes: 0, elapsedMs: 0 };
    }

    // Ход последней досчитанной глубины. Инициализируем первым по сортировке,
    // чтобы даже при мгновенном исчерпании бюджета вернуть осмысленный ход.
    let bestMove = sortMoves(state, rootMoves, [])[0];
    let bestScore = 0;
    let completedDepth = 0;
    let ordered = sortMoves(state, rootMoves, []);

    for (let depth = 1; depth <= this.opts.maxDepth; depth++) {
      let alpha = -MATE;
      let iterationBest: Move | null = null;
      const scored: { m: Move; s: number }[] = [];

      for (const move of ordered) {
        const score = -this.negamax(applyMove(state, move), depth - 1, -MATE, -alpha, 1, move.to);
        if (this.aborted) break;
        scored.push({ m: move, s: score });
        if (iterationBest === null || score > alpha) {
          alpha = score;
          iterationBest = move;
        }
      }

      if (this.aborted) break; // глубина не досчитана — её результат неполон
      if (iterationBest !== null) {
        bestMove = iterationBest;
        bestScore = alpha;
        completedDepth = depth;
        // Лучший ход прошлой итерации — первым на следующей: так альфа-бета
        // отсекает заметно больше.
        ordered = scored.sort((a, b) => b.s - a.s).map((x) => x.m);
      }
      // Мат найден — считать глубже незачем.
      if (Math.abs(bestScore) >= MATE_THRESHOLD) break;
    }

    return {
      move: bestMove,
      score: bestScore,
      depth: completedDepth,
      nodes: this.nodes,
      elapsedMs: Date.now() - started,
    };
  }
}

/**
 * Лёгкий уровень: без перебора вообще. Смотрит на один ход вперёд и только на
 * материал, затем случайно выбирает среди ходов в пределах полпешки от лучшего.
 *
 * Так бот не видит двухходовых ловушек (его легко поймать тактикой), но и не
 * зевает фигуру просто так — играет неровно, а не бессмысленно.
 */
export function searchEasy(state: GameState, random: () => number = Math.random): SearchResult {
  const started = Date.now();
  const moves = legalMoves(state);
  if (moves.length === 0) return { move: null, score: 0, depth: 0, nodes: 0, elapsedMs: 0 };

  const TOLERANCE = 50; // полпешки
  let best = -Infinity;
  const scored = moves.map((m) => {
    const next = applyMove(state, m);
    // evaluateMaterial считает с точки зрения СТОРОНЫ, ЧЕЙ ХОД, а после
    // применения хода это уже соперник, — поэтому знак меняется.
    const score = -evaluateMaterial(next);
    if (score > best) best = score;
    return { m, score };
  });

  const candidates = scored.filter((x) => x.score >= best - TOLERANCE);
  const pick = candidates[Math.floor(random() * candidates.length)] ?? scored[0];
  return {
    move: pick.m,
    score: pick.score,
    depth: 1,
    nodes: moves.length,
    elapsedMs: Date.now() - started,
  };
}

/**
 * Средний уровень: честный альфа-бета с сортировкой взятий, но без кэша
 * позиций и без «тихого» поиска — ошибается в тактике чуть глубже своей
 * границы. Обыгрывается вдумчивой игрой.
 */
export function searchMedium(state: GameState, budgetMs = 600): SearchResult {
  return new Search({
    budgetMs,
    useTT: false,
    useKillers: false,
    useQuiescence: false,
    maxDepth: 8,
  }).run(state);
}

/**
 * Сложный уровень: всё вместе — кэш позиций, killer-эвристика и «тихий» поиск
 * взятий. Считает заметно глубже среднего при том же ветвлении.
 */
export function searchHard(state: GameState, budgetMs = 2500): SearchResult {
  return new Search({
    budgetMs,
    useTT: true,
    useKillers: true,
    useQuiescence: true,
    maxDepth: 24,
  }).run(state);
}
