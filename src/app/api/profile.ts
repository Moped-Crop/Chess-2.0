/** Профиль: обновление имени/аватара и чтение статистики. */

import { api } from './client';
import type { PublicUser } from './auth';

export interface UserStats {
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
}

export function apiUpdateProfile(input: {
  displayName?: string;
  avatarBase64?: string | null;
}): Promise<{ user: PublicUser }> {
  return api('/api/profile', { method: 'PUT', body: input });
}

export function apiGetStats(
  userId: number,
): Promise<{ stats: UserStats; username: string; displayName: string }> {
  return api(`/api/stats/${userId}`);
}
