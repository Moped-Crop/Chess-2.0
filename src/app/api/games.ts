/** История онлайн-партий: список и полная партия для повтора. */

import { api } from './client';
import type { Move, Color, GameResult } from '../../engine/types';
import type { OnlineEndReason } from '../store/gameStore';

/** Публичная карточка игрока в истории/партии. `id` — для ручки аватара. */
export interface GamePlayer {
  id: number;
  username: string;
  displayName: string;
  /** Может отсутствовать у ответов старого сервера. */
  rating?: number;
}

export interface HistoryEntry {
  id: number;
  opponent: GamePlayer;
  myColor: Color;
  result: GameResult | null;
  winReason: OnlineEndReason | null;
  timeControlId: string | null;
  finishedAt: string | null;
  isRanked: boolean;
  /** Изменение рейтинга игрока за партию; null для нерейтинговых. */
  ratingDelta: number | null;
}

export interface HistoryPage {
  games: HistoryEntry[];
  hasMore: boolean;
}

export interface GameDetail {
  id: number;
  moves: Move[];
  status: string;
  result: GameResult | null;
  winReason: OnlineEndReason | null;
  timeControlId: string | null;
  myColor: Color;
  players: { white: GamePlayer; black: GamePlayer };
  finishedAt: string | null;
  isRanked: boolean;
  /** Изменение рейтинга зрителя (если он участник рейтинговой партии). */
  ratingDelta: number | null;
}

export function apiGameHistory(page: number): Promise<HistoryPage> {
  return api(`/api/games/history?page=${page}`);
}

export function apiGameDetail(id: number): Promise<GameDetail> {
  return api(`/api/games/${id}`);
}
