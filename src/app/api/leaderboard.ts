/** Лидерборд: топ по рейтингу + своя позиция. */

import { api } from './client';
import type { RankedStats } from './players';

export interface LeaderboardEntry {
  place: number;
  userId: number;
  username: string;
  displayName: string;
  rating: number;
  ranked: RankedStats;
}

export interface LeaderboardMe {
  rating: number;
  rankedGamesPlayed: number;
  /** Сыграно ли достаточно партий, чтобы попасть в таблицу. */
  eligible: boolean;
  /** Сколько партий осталось до порога (0, если уже в таблице). */
  gamesToQualify: number;
  /** Место в общем зачёте (null, если ещё не в таблице). */
  place: number | null;
}

export interface LeaderboardPage {
  page: number;
  pageSize: number;
  minRanked: number;
  entries: LeaderboardEntry[];
  hasMore: boolean;
  me: LeaderboardMe;
}

export function apiLeaderboard(page: number): Promise<LeaderboardPage> {
  return api(`/api/leaderboard?page=${page}`);
}
