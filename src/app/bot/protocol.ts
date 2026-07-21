/**
 * Протокол общения с воркером бота. Отдельный файл, чтобы его могли
 * импортировать и главный поток, и воркер, не утягивая друг друга: воркеру
 * нечего знать про Zustand и звук, а стору — про поиск.
 */

import type { GameState, Move } from '../../engine/types';

/** Уровень сложности бота. */
export type BotDifficulty = 'easy' | 'medium' | 'hard';

/** Запрос «подумай над этой позицией». */
export interface BotRequest {
  type: 'think';
  game: GameState;
  difficulty: BotDifficulty;
  /** Номер запроса: ответ на устаревший (новая партия) просто игнорируется. */
  requestId: number;
}

/** Ответ воркера. move = null, если ходов нет (партия уже кончилась). */
export interface BotResponse {
  type: 'move';
  move: Move | null;
  requestId: number;
  /** Диагностика — досчитанная глубина, узлы, затраченное время. */
  depth: number;
  nodes: number;
  elapsedMs: number;
}
