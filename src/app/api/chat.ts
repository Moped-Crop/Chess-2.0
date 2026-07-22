/** Чат с друзьями: список бесед, история треда, отметка прочтения. */

import { api } from './client';

export type MessageKind = 'text' | 'invite';
export type InviteStatus = 'pending' | 'accepted' | 'declined';

/** Реакция глазами текущего пользователя (сервер уже посчитал). */
export interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatMessage {
  id: number;
  friendshipId: number;
  senderId: number;
  kind: MessageKind;
  body: string;
  inviteGameId: number | null;
  inviteTimeControlId: string | null;
  /** Приглашение на рейтинговую партию — пометка на карточке. */
  inviteRanked: boolean;
  inviteStatus: InviteStatus;
  editedAt: string | null;
  createdAt: string;
  reactions: Reaction[];
}

/** Собеседник в списке бесед. */
export interface ChatFriend {
  id: number;
  username: string;
  displayName: string;
  rating: number;
}

export interface Conversation {
  friendshipId: number;
  friend: ChatFriend;
  online: boolean;
  unreadCount: number;
  lastMessage: ChatMessage | null;
}

export function apiConversations(): Promise<{ conversations: Conversation[] }> {
  return api('/api/chat/conversations');
}

export function apiThreadMessages(
  friendshipId: number,
  before?: number,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const q = before ? `?before=${before}` : '';
  return api(`/api/chat/${friendshipId}/messages${q}`);
}

export function apiMarkRead(friendshipId: number): Promise<{ ok: boolean }> {
  return api(`/api/chat/${friendshipId}/read`, { method: 'POST' });
}
