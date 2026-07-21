/** Публичный профиль другого игрока по нику (read-only). */

import { api } from './client';
import type { UserStats } from './profile';
import type { GamePlayer } from './games';
import type { Color, GameResult } from '../../engine/types';

export interface PlayerCardFull {
  deleted: false;
  id: number;
  username: string;
  displayName: string;
  avatarBase64: string | null;
  online: boolean;
  stats: UserStats;
}

/** Анонимизированный аккаунт: имени, аватара и статистики у него уже нет. */
export interface PlayerCardDeleted {
  deleted: true;
  id: number;
  username: string;
}

export type PlayerCard = PlayerCardFull | PlayerCardDeleted;

export function apiPlayer(username: string): Promise<PlayerCard> {
  return api(`/api/players/${encodeURIComponent(username)}`);
}

/** Завершённая партия в истории игрока — цвет и соперник с ЕГО стороны. */
export interface PlayerGame {
  id: number;
  opponent: GamePlayer;
  playerColor: Color;
  result: GameResult | null;
  winReason: string | null;
  timeControlId: string | null;
  finishedAt: string | null;
}

export function apiPlayerGames(
  username: string,
  page: number,
): Promise<{ games: PlayerGame[]; hasMore: boolean }> {
  return api(`/api/players/${encodeURIComponent(username)}/games?page=${page}`);
}
