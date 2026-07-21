/** Публичный профиль другого игрока по нику (read-only). */

import { api } from './client';
import type { UserStats } from './profile';

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
