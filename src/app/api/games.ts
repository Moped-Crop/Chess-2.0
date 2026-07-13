/** История онлайн-партий: список и полная партия для повтора. */

import { api } from './client';
import type { Move, Color, GameResult } from '../../engine/types';
import type { OnlineEndReason } from '../store/gameStore';

/** Публичная карточка игрока в истории (без id — он тут не нужен). */
export interface GamePlayer {
  username: string;
  displayName: string;
  avatarBase64: string | null;
}

export interface HistoryEntry {
  id: number;
  opponent: GamePlayer;
  myColor: Color;
  result: GameResult | null;
  winReason: OnlineEndReason | null;
  timeControlId: string | null;
  finishedAt: string | null;
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
}

export function apiGameHistory(page: number): Promise<HistoryPage> {
  return api(`/api/games/history?page=${page}`);
}

export function apiGameDetail(id: number): Promise<GameDetail> {
  return api(`/api/games/${id}`);
}
