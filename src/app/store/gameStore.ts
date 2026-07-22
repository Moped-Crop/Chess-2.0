/**
 * Слой матча (Zustand): GameState, выбор клетки, легальные ходы, стек отмены,
 * модалка выбора, ЧАСЫ (§9), история ходов, взятые фигуры, ориентация и тема.
 *
 * UI НИКОГДА не реализует правила — он лишь вызывает движок и рисует результат
 * (Tech_Plan §3.1).
 */

import { create } from 'zustand';
import type { Color, GameResult, GameState, Move, Piece, Square } from '../../engine/types';
import {
  createInitialState,
  legalMoves,
  applyMove,
  computeResult,
  isInsufficientMaterial,
  isKingInCheck,
} from '../../engine';
import { saveGame, loadGame, loadSettings, saveSettings } from '../persistence/storage';
import { moveSan, type MoveEntry } from '../notation';
import type { Lang } from '../i18n';
import {
  moveSound,
  captureSound,
  checkSound,
  evolutionSound,
  victorySound,
  drawSound,
  flagFallSound,
  tickSound,
  setVolume as setMasterVolume,
} from '../sound';
import {
  createClock,
  applyElapsed,
  flaggedColor,
  switchAfterMove,
  presetById,
  type ClockState,
} from '../clock/clock';
import { emitMove } from '../net/socket';
import type { BotDifficulty } from '../bot/protocol';

export type Orientation = 'white' | 'black' | 'auto';
export type UiTheme = 'dark' | 'light';
export type GameMode = 'local' | 'online' | 'replay' | 'tutorial' | 'bot';

// Уровень сложности объявлен в bot/protocol.ts (его же читает воркер) —
// здесь только реэкспорт, чтобы тип не расползся в двух определениях.
export type { BotDifficulty };

/** Причина завершения онлайн-партии ('game' — мат/пат/ничья по правилам). */
export type OnlineEndReason = 'game' | 'resign' | 'abandon' | 'timeout';

/** Изменение рейтинга ИГРОКА за только что завершившуюся рейтинговую партию. */
export interface OnlineRating {
  delta: number;
  newRating: number;
}

/** Противник в онлайн-партии (для PlayerBar). */
export interface OpponentInfo {
  displayName: string;
  userId: number | null;
}

interface PendingChoice {
  from: Square;
  to: Square;
  moves: Move[];
  kind: 'evolution' | 'promotion';
}

/**
 * Детали последнего применённого хода — только для анимаций доски
 * (скольжение фигуры, растворение взятой, вспышка эволюции/превращения).
 * seq растёт с каждым ходом, чтобы React перезапускал анимации.
 */
export interface LastAction {
  seq: number;
  from: Square;
  to: Square;
  rookFrom?: Square;
  rookTo?: Square;
  capturedSquare?: Square;
  capturedPiece?: Piece;
  evolved?: boolean;
  promoted?: boolean;
}

/**
 * Собрать LastAction для анимаций доски. Чистая функция — используется и в
 * commit() (живая партия), и в пошаговой перемотке повтора (stepReplay*).
 */
export function buildLastAction(before: GameState, move: Move, prevSeq: number): LastAction {
  const capturedPiece = move.capture !== undefined ? before.board[move.capture] : null;
  const homeRank = before.turn === 'white' ? 0 : 7;
  const isCastle = move.special === 'castle-king' || move.special === 'castle-queen';
  return {
    seq: prevSeq + 1,
    from: move.from,
    to: move.to,
    ...(isCastle && {
      rookFrom: move.special === 'castle-king' ? homeRank * 10 + 9 : homeRank * 10,
      rookTo: move.special === 'castle-king' ? homeRank * 10 + 6 : homeRank * 10 + 4,
    }),
    ...(move.capture !== undefined &&
      capturedPiece && { capturedSquare: move.capture, capturedPiece }),
    ...(move.evolveTo !== undefined && { evolved: true }),
    ...(move.promotion !== undefined && { promoted: true }),
  };
}

interface GameStore {
  game: GameState;
  past: GameState[];
  selected: Square | null;
  legal: Move[];
  pending: PendingChoice | null;
  lastMove: { from: Square; to: Square } | null;
  lastAction: LastAction | null;
  /** Последний применённый ход как есть (для проверки целей практики). */
  lastMoveApplied: Move | null;
  clock: ClockState | null;
  presetId: string;
  moveLog: MoveEntry[];
  captures: (Piece | null)[];
  orientation: Orientation;
  themeId: string;
  uiTheme: UiTheme;
  muted: boolean;
  volume: number; // 0..1 — громкость всех звуков
  lang: Lang;

  // --- Онлайн-режим (mode='local' — всё поведение прежнее) ---
  mode: GameMode;
  onlineGameId: number | null;
  /** Цвет, которым играет человек: и в онлайне, и в партии с ботом. */
  myColor: Color | null;
  opponent: OpponentInfo | null;
  onlineEndReason: OnlineEndReason | null;
  /** Рейтинговая дельта игрока за завершённую партию (для модалки окончания). */
  onlineRating: OnlineRating | null;

  // --- Партия с ботом (mode='bot': чистый клиент, сервера не касается) ---
  botDifficulty: BotDifficulty | null;
  /** Бот считает ход — доска на это время не принимает кликов. */
  botThinking: boolean;

  /** Применить ПОДТВЕРЖДЁННЫЙ ход (общий путь локального и онлайн-режима). */
  applyConfirmedMove: (move: Move) => void;
  /** Оптимистично применить свой ход и отправить на сервер. */
  submitOnlineMove: (move: Move) => void;
  /** Ход соперника по сокету; clock — свежий серверный снэпшот часов. */
  applyRemoteMove: (move: Move, clock?: ClockState | null) => void;
  /** Загрузка/ресинхронизация онлайн-партии: проигрываем ходы с начала. */
  startOnlineGame: (payload: {
    gameId: number;
    myColor: Color;
    opponent: OpponentInfo;
    moves: Move[];
    result: GameResult;
    reason: OnlineEndReason | null;
    clock: ClockState | null;
  }) => void;
  /** Партия завершена сервером (мат/сдача/разрыв/тайм-аут). rating — своя дельта для рейтинговых. */
  finishOnlineGame: (
    result: GameResult,
    reason: OnlineEndReason,
    rating?: OnlineRating | null,
  ) => void;
  /** Выйти из онлайн-режима и вернуть локальный автосейв. */
  leaveOnlineGame: () => void;

  // --- Просмотр истории (mode='replay': доска не принимает ходов) ---
  /** Показать кадр повтора: позиция по индексу, полные лог/взятия. */
  loadReplayFrame: (payload: {
    game: GameState;
    moveLog: MoveEntry[];
    captures: (Piece | null)[];
    lastMove: { from: Square; to: Square } | null;
  }) => void;
  /** Выйти из повтора и вернуть локальный автосейв. */
  exitReplay: () => void;

  // --- Партия с ботом ---
  /** Начать партию с ботом: свежая позиция, человек играет humanColor. */
  startBotGame: (humanColor: Color, difficulty: BotDifficulty) => void;
  /** Выйти из партии с ботом и вернуть локальный автосейв. */
  exitBotGame: () => void;
  /** Пометить, что бот сейчас считает ход. */
  setBotThinking: (thinking: boolean) => void;
  /** Человек сдаётся боту: победа достаётся цвету бота. */
  resignBotGame: () => void;

  // --- Практика обучения (mode='tutorial': реальные ходы на настоящей доске) ---
  /** Начать упражнение: позиция + чей ход (+ поле e.p., если сценарию нужно). */
  startTutorialPractice: (payload: {
    board: (Piece | null)[];
    turn: Color;
    enPassant?: Square | null;
  }) => void;
  /** Выйти из практики и вернуть локальный автосейв. */
  exitTutorialPractice: () => void;

  /** Перемотка повтора на один ход ВПЕРЁД: честный before→after с анимацией. */
  stepReplayForward: (move: Move) => void;
  /** Перемотка на один ход НАЗАД: готовый кадр N−1 + развёрнутая анимация. */
  stepReplayBackward: (payload: {
    game: GameState;
    lastMove: { from: Square; to: Square } | null;
    undone: Move;
  }) => void;

  newGame: () => void;
  setPreset: (id: string) => void;
  setOrientation: (o: Orientation) => void;
  setTheme: (id: string) => void;
  setUiTheme: (t: UiTheme) => void;
  setLang: (l: Lang) => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  loadMatch: (game: GameState, moveLog: MoveEntry[], captures: (Piece | null)[]) => void;
  clickSquare: (s: Square) => void;
  resolveChoice: (move: Move) => void;
  cancelChoice: () => void;
  undo: () => void;
  tickClock: () => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  const settings = loadSettings();
  const persistSettings = (): void => {
    const st = get();
    saveSettings({
      orientation: st.orientation,
      themeId: st.themeId,
      uiTheme: st.uiTheme,
      muted: st.muted,
      volume: st.volume,
      lang: st.lang,
    });
  };

  /**
   * Применить подтверждённый ход к состоянию. Общий путь обоих режимов:
   * локальный клик и ход из сети приводят к одному и тому же применению.
   */
  const commit = (move: Move): void => {
    const { game, past, clock, moveLog, captures, mode } = get();
    const mover = game.board[move.from];
    const capturedPiece = move.capture !== undefined ? game.board[move.capture] : null;

    const applied = applyMove(game, move);
    const next: GameState = { ...applied, result: computeResult(applied) };

    const entry: MoveEntry = {
      color: game.turn,
      pieceType: mover ? mover.type : 'P',
      san: moveSan(move, next),
    };
    const nextLog = [...moveLog, entry];
    const nextCaptures = [...captures, capturedPiece];
    // Автосейв — только локальные партии; онлайн-партию хранит сервер.
    if (mode === 'local') saveGame(next, nextLog, nextCaptures);

    // Звук по важности события: конец партии > шах > эволюция/превращение >
    // взятие > обычный ход.
    if (!get().muted) {
      if (next.result === 'white' || next.result === 'black') victorySound();
      else if (next.result === 'draw') drawSound();
      else if (isKingInCheck(next.board, next.turn)) checkSound();
      else if (move.evolveTo !== undefined || move.promotion !== undefined) evolutionSound();
      else if (move.capture !== undefined) captureSound();
      else moveSound();
    }

    const nextClock =
      clock && clock.activeColor !== null
        ? switchAfterMove(clock, game.turn, performance.now(), next.result !== 'ongoing')
        : clock;

    // Данные для анимаций доски (см. LastAction).
    const action = buildLastAction(game, move, get().lastAction?.seq ?? 0);

    set({
      game: next,
      past: [...past, game],
      selected: null,
      legal: next.result === 'ongoing' ? legalMoves(next) : [],
      pending: null,
      lastMove: { from: move.from, to: move.to },
      lastAction: action,
      lastMoveApplied: move,
      clock: nextClock,
      moveLog: nextLog,
      captures: nextCaptures,
    });
  };

  /** Выбор пути хода: локально — сразу применить; онлайн — применить
   *  оптимистично и отправить на сервер (submitOnlineMove). */
  const performMove = (move: Move): void => {
    if (get().mode === 'online') get().submitOnlineMove(move);
    else commit(move);
  };

  // Применить сохранённую громкость к звуковому движку при старте.
  const initialVolume = Math.min(1, Math.max(0, settings.volume ?? 1));
  setMasterVolume(initialVolume);

  const loaded = loadGame();
  const start = loaded?.game ?? createInitialState();
  return {
    game: start,
    past: [],
    selected: null,
    legal: start.result === 'ongoing' ? legalMoves(start) : [],
    pending: null,
    lastMove: null,
    lastAction: null,
    lastMoveApplied: null,
    clock: null,
    presetId: 'none',
    moveLog: loaded?.moveLog ?? [],
    captures: loaded?.captures ?? [],
    orientation: (settings.orientation as Orientation) ?? 'white',
    themeId: settings.themeId ?? 'brown',
    uiTheme: (settings.uiTheme as UiTheme) ?? 'dark',
    muted: settings.muted ?? false,
    volume: initialVolume,
    lang: (settings.lang as Lang) ?? 'ru',

    mode: 'local',
    onlineGameId: null,
    myColor: null,
    opponent: null,
    onlineEndReason: null,
    onlineRating: null,
    botDifficulty: null,
    botThinking: false,

    applyConfirmedMove: (move) => commit(move),

    submitOnlineMove: (move) => {
      const { onlineGameId, moveLog } = get();
      if (onlineGameId === null) return;
      const index = moveLog.length; // номер хода ДО применения
      // Оптимистично: партия идёт между людьми, интерфейс должен отвечать
      // мгновенно; редкий рассинхрон чинится ресинком по move-rejected.
      commit(move);
      emitMove(onlineGameId, move, index);
    },

    applyRemoteMove: (move, clock) => {
      const { game, mode } = get();
      if (mode !== 'online' || game.result !== 'ongoing') return;
      // Свой оптимистичный ход не приходит эхом (сервер шлёт остальным),
      // но на всякий случай не применяем ход «за себя».
      if (game.turn === get().myColor) return;
      commit(move);
      // Серверный снэпшот часов авторитетнее локального пересчёта в commit:
      // подменяем сразу после применения хода (оба set — в одном тике React,
      // промежуточное состояние не отрисовывается). lastTickTs сервера — из
      // Date.now(), локальный тикер живёт на performance.now() — пересчитываем.
      if (clock !== undefined) {
        set({
          clock: clock
            ? { ...clock, lastTickTs: clock.activeColor !== null ? performance.now() : null }
            : null,
        });
      }
    },

    startOnlineGame: ({ gameId, myColor, opponent, moves, result, reason, clock }) => {
      // Восстановление с нуля: та же логика, что на сервере, — движок один.
      let g = createInitialState();
      const log: MoveEntry[] = [];
      const caps: (Piece | null)[] = [];
      for (const m of moves) {
        const mover = g.board[m.from];
        caps.push(m.capture !== undefined ? g.board[m.capture] : null);
        const applied = applyMove(g, m);
        g = { ...applied, result: computeResult(applied) };
        log.push({
          color: mover?.color ?? 'white',
          pieceType: mover ? mover.type : 'P',
          san: moveSan(m, g),
        });
      }
      if (result !== 'ongoing') g = { ...g, result };
      const last = moves.length > 0 ? moves[moves.length - 1] : null;
      set({
        game: g,
        past: [],
        selected: null,
        legal: g.result === 'ongoing' ? legalMoves(g) : [],
        pending: null,
        lastMove: last ? { from: last.from, to: last.to } : null,
        lastAction: null,
        // Серверный снэпшот: whiteMs/blackMs как есть, но точка отсчёта
        // пересчитывается на performance.now() — источник времени локального
        // тикера (сервер прислал ms в терминах Date.now()).
        clock: clock
          ? { ...clock, lastTickTs: clock.activeColor !== null ? performance.now() : null }
          : null,
        moveLog: log,
        captures: caps,
        mode: 'online',
        onlineGameId: gameId,
        myColor,
        opponent,
        onlineEndReason: reason ?? null,
        onlineRating: null,
        botDifficulty: null,
        botThinking: false,
        // Своя сторона всегда снизу; настройка ориентации не перезаписывается.
        orientation: myColor,
      });
    },

    finishOnlineGame: (result, reason, rating) => {
      const { game, muted, clock } = get();
      if (result === 'ongoing') return;
      // Часы останавливаются при любом завершении — иначе локальный тикер
      // продолжит впустую крутиться до следующего ре-рендера.
      const stoppedClock: ClockState | null = clock
        ? { ...clock, activeColor: null, lastTickTs: null }
        : null;
      if (game.result !== 'ongoing') {
        // Результат уже применён оптимистичным ходом — дописываем причину.
        set({ onlineEndReason: reason, onlineRating: rating ?? null, clock: stoppedClock });
        return;
      }
      if (!muted) {
        if (result === 'draw') drawSound();
        else victorySound();
      }
      set({
        game: { ...game, result },
        legal: [],
        pending: null,
        selected: null,
        onlineEndReason: reason,
        onlineRating: rating ?? null,
        clock: stoppedClock,
      });
    },

    loadReplayFrame: ({ game, moveLog, captures, lastMove }) => {
      // В отличие от loadMatch (загрузка локального сейва как живой партии),
      // кадр повтора НЕ пишется в автосейв — это только просмотр.
      set({
        game,
        past: [],
        selected: null,
        legal: [],
        pending: null,
        lastMove,
        lastAction: null,
        clock: null,
        moveLog,
        captures,
        mode: 'replay',
        onlineGameId: null,
        myColor: null,
        opponent: null,
        onlineEndReason: null,
        botDifficulty: null,
        botThinking: false,
      });
    },

    startTutorialPractice: ({ board, turn, enPassant }) => {
      // Свежий GameState из позиции сценария: «ничего ещё не ходило» —
      // права рокировки полные (hasMoved фигур и так false), счётчики нулевые.
      const g: GameState = {
        board: board.slice(),
        turn,
        castling: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
        enPassant: enPassant ?? null,
        halfmoveClock: 0,
        fullmove: 1,
        history: [],
        result: 'ongoing',
      };
      // Автосейв НЕ трогаем: практика — песочница (commit пишет сейв только
      // в mode='local').
      set({
        game: g,
        past: [],
        selected: null,
        legal: legalMoves(g),
        pending: null,
        lastMove: null,
        lastAction: null,
        lastMoveApplied: null,
        clock: null,
        moveLog: [],
        captures: [],
        mode: 'tutorial',
        onlineGameId: null,
        myColor: null,
        opponent: null,
        onlineEndReason: null,
        botDifficulty: null,
        botThinking: false,
        orientation: 'white',
      });
    },

    exitTutorialPractice: () => {
      if (get().mode !== 'tutorial') return;
      // Возвращаем локальный автосейв — как exitReplay.
      const saved = loadGame();
      const g = saved?.game ?? createInitialState();
      set({
        game: g,
        past: [],
        selected: null,
        legal: g.result === 'ongoing' ? legalMoves(g) : [],
        pending: null,
        lastMove: null,
        lastAction: null,
        clock: null,
        moveLog: saved?.moveLog ?? [],
        captures: saved?.captures ?? [],
        mode: 'local',
        onlineGameId: null,
        myColor: null,
        opponent: null,
        onlineEndReason: null,
        botDifficulty: null,
        botThinking: false,
        orientation: (loadSettings().orientation as Orientation) ?? 'white',
      });
    },

    stepReplayForward: (move) => {
      const { game, mode, lastAction } = get();
      if (mode !== 'replay') return;
      // Реальное применение хода движком (не подстановка готового кадра):
      // Board.tsx получает честный before→after и анимирует как в живой партии.
      const applied = applyMove(game, move);
      const next: GameState = { ...applied, result: computeResult(applied) };
      set({
        game: next,
        lastMove: { from: move.from, to: move.to },
        lastAction: buildLastAction(game, move, lastAction?.seq ?? 0),
      });
    },

    stepReplayBackward: ({ game, lastMove, undone }) => {
      const { mode, lastAction } = get();
      if (mode !== 'replay') return;
      // Кадр N−1 прекомпьютнут страницей; анимация — развёрнутый ход: фигура
      // едет обратно (to→from), ладья Бастиона тоже. Взятая фигура появляется
      // мгновенно (растворение «задом наперёд» красиво не сделать), вспышку
      // эволюции/превращения назад не показываем — осознанные упрощения.
      const isCastle = undone.special === 'castle-king' || undone.special === 'castle-queen';
      // После отката очередь хода — у той стороны, что делала отменённый ход.
      const homeRank = game.turn === 'white' ? 0 : 7;
      const action: LastAction = {
        seq: (lastAction?.seq ?? 0) + 1,
        from: undone.to,
        to: undone.from,
        ...(isCastle && {
          rookFrom: undone.special === 'castle-king' ? homeRank * 10 + 6 : homeRank * 10 + 4,
          rookTo: undone.special === 'castle-king' ? homeRank * 10 + 9 : homeRank * 10,
        }),
      };
      set({ game, lastMove, lastAction: action, selected: null, pending: null });
    },

    exitReplay: () => {
      if (get().mode !== 'replay') return;
      // Возвращаем локальный автосейв — тем же способом, что leaveOnlineGame.
      const saved = loadGame();
      const g = saved?.game ?? createInitialState();
      set({
        game: g,
        past: [],
        selected: null,
        legal: g.result === 'ongoing' ? legalMoves(g) : [],
        pending: null,
        lastMove: null,
        lastAction: null,
        clock: null,
        moveLog: saved?.moveLog ?? [],
        captures: saved?.captures ?? [],
        mode: 'local',
        onlineGameId: null,
        myColor: null,
        opponent: null,
        onlineEndReason: null,
        botDifficulty: null,
        botThinking: false,
        orientation: (loadSettings().orientation as Orientation) ?? 'white',
      });
    },

    startBotGame: (humanColor, difficulty) => {
      // Свежая партия целиком в памяти: на сервер не уходит и в локальный
      // автосейв не пишется (commit сохраняет только mode='local').
      const g = createInitialState();
      set({
        game: g,
        past: [],
        selected: null,
        legal: legalMoves(g),
        pending: null,
        lastMove: null,
        lastAction: null,
        lastMoveApplied: null,
        clock: null, // партии с ботом играются без часов
        moveLog: [],
        captures: [],
        mode: 'bot',
        onlineGameId: null,
        myColor: humanColor,
        opponent: null,
        onlineEndReason: null,
        botDifficulty: difficulty,
        botThinking: false,
        // Своя сторона всегда снизу — как в онлайне; настройка ориентации
        // при этом не перезаписывается (persistSettings не вызываем).
        orientation: humanColor,
      });
    },

    exitBotGame: () => {
      if (get().mode !== 'bot') return;
      // Возвращаем локальный автосейв — как exitReplay/exitTutorialPractice.
      const saved = loadGame();
      const g = saved?.game ?? createInitialState();
      set({
        game: g,
        past: [],
        selected: null,
        legal: g.result === 'ongoing' ? legalMoves(g) : [],
        pending: null,
        lastMove: null,
        lastAction: null,
        clock: null,
        moveLog: saved?.moveLog ?? [],
        captures: saved?.captures ?? [],
        mode: 'local',
        onlineGameId: null,
        myColor: null,
        opponent: null,
        onlineEndReason: null,
        botDifficulty: null,
        botThinking: false,
        orientation: (loadSettings().orientation as Orientation) ?? 'white',
      });
    },

    setBotThinking: (thinking) => set({ botThinking: thinking }),

    resignBotGame: () => {
      const { mode, game, myColor, muted } = get();
      if (mode !== 'bot' || game.result !== 'ongoing' || myColor === null) return;
      // Сдача человека = победа цвета бота. Партия с ботом никуда не
      // отправляется, поэтому результат просто ставится локально.
      const winner: GameResult = myColor === 'white' ? 'black' : 'white';
      if (!muted) victorySound();
      set({
        game: { ...game, result: winner },
        legal: [],
        selected: null,
        pending: null,
        botThinking: false,
      });
    },

    leaveOnlineGame: () => {
      if (get().mode !== 'online') return;
      // Возвращаем локальный автосейв — «Играть на одном ПК» не пострадала.
      const saved = loadGame();
      const g = saved?.game ?? createInitialState();
      set({
        game: g,
        past: [],
        selected: null,
        legal: g.result === 'ongoing' ? legalMoves(g) : [],
        pending: null,
        lastMove: null,
        lastAction: null,
        clock: null,
        moveLog: saved?.moveLog ?? [],
        captures: saved?.captures ?? [],
        mode: 'local',
        onlineGameId: null,
        myColor: null,
        opponent: null,
        onlineEndReason: null,
        botDifficulty: null,
        botThinking: false,
        orientation: (loadSettings().orientation as Orientation) ?? 'white',
      });
    },

    newGame: () => {
      const g = createInitialState();
      saveGame(g, [], []);
      set({
        game: g,
        past: [],
        selected: null,
        legal: legalMoves(g),
        pending: null,
        lastMove: null,
        lastAction: null,
        clock: createClock(presetById(get().presetId), performance.now()),
        moveLog: [],
        captures: [],
      });
    },

    setPreset: (id) => {
      set({ presetId: id });
      get().newGame();
    },

    setOrientation: (o) => {
      set({ orientation: o });
      persistSettings();
    },

    setTheme: (id) => {
      set({ themeId: id });
      persistSettings();
    },

    setUiTheme: (t) => {
      set({ uiTheme: t });
      persistSettings();
    },

    setLang: (l) => {
      set({ lang: l });
      persistSettings();
    },

    toggleMute: () => {
      set({ muted: !get().muted });
      persistSettings();
    },

    setVolume: (v) => {
      const volume = Math.min(1, Math.max(0, v));
      setMasterVolume(volume);
      set({ volume });
      persistSettings();
    },

    loadMatch: (game, moveLog, captures) => {
      saveGame(game, moveLog, captures);
      set({
        game,
        past: [],
        selected: null,
        legal: game.result === 'ongoing' ? legalMoves(game) : [],
        pending: null,
        lastMove: null,
        lastAction: null,
        clock: null,
        moveLog,
        captures,
      });
    },

    clickSquare: (s) => {
      const { game, selected, legal, pending, mode, myColor, botThinking } = get();
      if (mode === 'replay') return; // просмотр истории: доска не кликается
      if (pending || game.result !== 'ongoing') return;
      // Онлайн: ходить можно только своим цветом и только в свою очередь.
      if (mode === 'online' && game.turn !== myColor) return;
      // Бот: не ходить за бота и не мешать, пока он считает.
      if (mode === 'bot' && (game.turn !== myColor || botThinking)) return;

      if (selected !== null) {
        // Дедупликация по смыслу хода: движок не должен выдавать дубли, но если
        // выдал — они не должны превращаться в ложное окно выбора.
        const seen = new Set<string>();
        const variants = legal.filter((m) => {
          if (m.from !== selected || m.to !== s) return false;
          const key = `${m.capture ?? ''}|${m.promotion ?? ''}|${m.evolveTo ?? ''}|${m.special ?? ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (variants.length === 1) {
          performMove(variants[0]);
          return;
        }
        if (variants.length > 1) {
          // Окно выбора открывается ТОЛЬКО при настоящем выборе: все варианты —
          // эволюция (разные формы) либо все — превращение (разные фигуры).
          if (variants.every((m) => m.evolveTo !== undefined)) {
            set({ pending: { from: selected, to: s, moves: variants, kind: 'evolution' } });
          } else if (variants.every((m) => m.promotion !== undefined)) {
            set({ pending: { from: selected, to: s, moves: variants, kind: 'promotion' } });
          } else {
            // Аномалия генератора: выбора по правилам нет — выполняем ход без окна.
            performMove(variants[0]);
          }
          return;
        }
      }

      const p = game.board[s];
      set({ selected: p && p.color === game.turn ? s : null });
    },

    resolveChoice: (move) => performMove(move),
    cancelChoice: () => set({ pending: null, selected: null }),

    undo: () => {
      const { past, moveLog, captures, mode } = get();
      if (mode === 'online') return; // в сетевой партии отмена невозможна
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      const prevLog = moveLog.slice(0, -1);
      const prevCaptures = captures.slice(0, -1);
      saveGame(prev, prevLog, prevCaptures);
      set({
        game: prev,
        past: past.slice(0, -1),
        selected: null,
        legal: prev.result === 'ongoing' ? legalMoves(prev) : [],
        pending: null,
        lastMove: null,
        lastAction: null,
        moveLog: prevLog,
        captures: prevCaptures,
      });
    },

    tickClock: () => {
      const { clock, game, moveLog, captures, muted, mode } = get();
      if (!clock || clock.activeColor === null || game.result !== 'ongoing') return;
      const ticked = applyElapsed(clock, performance.now());
      const flagged = flaggedColor(ticked);
      if (flagged) {
        // Онлайн: клиентский тикер — НЕ источник истины. Зажимаем показ на
        // нуле и останавливаем тиканье; настоящий вердикт (game-over с
        // reason='timeout') придёт от сервера — он сам следит за флажком.
        if (mode === 'online') {
          set({ clock: { ...ticked, activeColor: null, lastTickTs: null } });
          return;
        }
        const winner = flagged === 'white' ? 'black' : 'white';
        const result = isInsufficientMaterial(game.board) ? 'draw' : winner;
        const stopped: GameState = { ...game, result };
        saveGame(stopped, moveLog, captures);
        if (!muted) flagFallSound();
        set({ clock: { ...ticked, activeColor: null, lastTickTs: null }, game: stopped, legal: [] });
        return;
      }
      // Тихое тиканье последних 10 секунд активной стороны (раз в секунду).
      if (!muted) {
        const before = clock.activeColor === 'white' ? clock.whiteMs : clock.blackMs;
        const after = ticked.activeColor === 'white' ? ticked.whiteMs : ticked.blackMs;
        if (after <= 10_000 && Math.ceil(after / 1000) !== Math.ceil(before / 1000)) tickSound();
      }
      set({ clock: ticked });
    },
  };
});
