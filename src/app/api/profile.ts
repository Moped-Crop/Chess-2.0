/** Профиль: обновление имени/аватара и чтение статистики. */

import { api } from './client';
import type { PublicUser } from './auth';

export interface UserStats {
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
}

/** Статистика по рейтинговым партиям (отдельная четвёрка). */
export interface RankedStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface StatsResponse {
  stats: UserStats;
  rating: number;
  peakRating: number;
  ranked: RankedStats;
  username: string;
  displayName: string;
}

export function apiUpdateProfile(input: {
  displayName?: string;
  avatarBase64?: string | null;
}): Promise<{ user: PublicUser }> {
  return api('/api/profile', { method: 'PUT', body: input });
}

export function apiGetStats(userId: number): Promise<StatsResponse> {
  return api(`/api/stats/${userId}`);
}
