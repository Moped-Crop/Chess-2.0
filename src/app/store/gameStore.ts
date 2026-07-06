/**
 * Слой матча (Zustand): GameState, выбор клетки, легальные ходы, стек отмены,
 * модалка выбора, ЧАСЫ (§9), история ходов, взятые фигуры, ориентация и тема.
 *
 * UI НИКОГДА не реализует правила — он лишь вызывает движок и рисует результат
 * (Tech_Plan §3.1).
 */

import { create } from 'zustand';
import type { GameState, Move, Piece, Square } from '../../engine/types';
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

export type Orientation = 'white' | 'black' | 'auto';
export type UiTheme = 'dark' | 'light';

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

interface GameStore {
  game: GameState;
  past: GameState[];
  selected: Square | null;
  legal: Move[];
  pending: PendingChoice | null;
  lastMove: { from: Square; to: Square } | null;
  lastAction: LastAction | null;
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

  const commit = (move: Move): void => {
    const { game, past, clock, moveLog, captures } = get();
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
    saveGame(next, nextLog, nextCaptures);

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
    const homeRank = game.turn === 'white' ? 0 : 7;
    const isCastle = move.special === 'castle-king' || move.special === 'castle-queen';
    const action: LastAction = {
      seq: (get().lastAction?.seq ?? 0) + 1,
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

    set({
      game: next,
      past: [...past, game],
      selected: null,
      legal: next.result === 'ongoing' ? legalMoves(next) : [],
      pending: null,
      lastMove: { from: move.from, to: move.to },
      lastAction: action,
      clock: nextClock,
      moveLog: nextLog,
      captures: nextCaptures,
    });
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
      const { game, selected, legal, pending } = get();
      if (pending || game.result !== 'ongoing') return;

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
          commit(variants[0]);
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
            commit(variants[0]);
          }
          return;
        }
      }

      const p = game.board[s];
      set({ selected: p && p.color === game.turn ? s : null });
    },

    resolveChoice: (move) => commit(move),
    cancelChoice: () => set({ pending: null, selected: null }),

    undo: () => {
      const { past, moveLog, captures } = get();
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
      const { clock, game, moveLog, captures, muted } = get();
      if (!clock || clock.activeColor === null || game.result !== 'ongoing') return;
      const ticked = applyElapsed(clock, performance.now());
      const flagged = flaggedColor(ticked);
      if (flagged) {
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
