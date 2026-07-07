/** Друзья: список, заявки, принятие/отклонение, удаление. */

import { api } from './client';
import type { PublicUser } from './auth';

export interface FriendEntry {
  friendshipId: number;
  user: PublicUser;
  online: boolean;
}

export interface FriendsList {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
}

export function apiFriends(): Promise<FriendsList> {
  return api('/api/friends');
}

export function apiFriendRequest(username: string): Promise<{ friendshipId: number }> {
  return api('/api/friends/request', { method: 'POST', body: { username } });
}

export function apiFriendAccept(friendshipId: number): Promise<{ ok: boolean }> {
  return api('/api/friends/accept', { method: 'POST', body: { friendshipId } });
}

export function apiFriendDecline(friendshipId: number): Promise<{ ok: boolean }> {
  return api('/api/friends/decline', { method: 'POST', body: { friendshipId } });
}

export function apiFriendRemove(friendshipId: number): Promise<{ ok: boolean }> {
  return api(`/api/friends/${friendshipId}`, { method: 'DELETE' });
}
