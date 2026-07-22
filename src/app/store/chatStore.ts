/**
 * Состояние переписки (Zustand): список бесед со счётчиками непрочитанного и
 * кэш открытых тредов.
 *
 * Один источник правды для всего приложения: бейджи в меню и в списке друзей
 * читают те же `conversations`, что держит в актуальном состоянии
 * `ChatLayer` — отдельно ничего досчитывать не нужно.
 *
 * `activeThreadId` — тред, реально открытый на экране (а не просто
 * загруженный в кэш). По нему отличается «сообщение пришло, пока я смотрю
 * именно сюда» (сразу прочитано, без тоста) от «пришло, пока я где-то ещё»
 * (непрочитано + тост).
 */

import { create } from 'zustand';
import {
  apiConversations,
  apiThreadMessages,
  apiMarkRead,
  type ChatMessage,
  type Conversation,
  type InviteStatus,
  type Reaction,
} from '../api/chat';
import { connectSocket } from '../net/socket';
import { useAuthStore } from './authStore';

export type { ChatMessage, Conversation };

export interface Thread {
  /** По возрастанию времени: старые сверху, новые снизу (как в ленте). */
  messages: ChatMessage[];
  loading: boolean;
  hasMore: boolean;
}

interface ChatStore {
  conversations: Conversation[];
  threads: Record<number, Thread>;
  activeThreadId: number | null;
  /** Список бесед хоть раз загружен (иначе бейджи ещё ничего не значат). */
  loaded: boolean;

  loadConversations: () => Promise<void>;
  openThread: (friendshipId: number) => Promise<void>;
  loadMoreMessages: (friendshipId: number) => Promise<void>;
  setActiveThread: (friendshipId: number | null) => void;

  sendMessage: (friendshipId: number, text: string) => void;
  sendInvite: (friendshipId: number, timeControlId: string) => void;
  editMessage: (messageId: number, text: string) => void;
  toggleReaction: (messageId: number, emoji: string) => void;
  markRead: (friendshipId: number) => void;

  onMessage: (msg: ChatMessage) => void;
  onMessageEdited: (p: { messageId: number; text: string; editedAt: string }) => void;
  onReactionUpdated: (p: { messageId: number; reactions: Reaction[] }) => void;
  onInviteStatusUpdated: (p: { messageId: number; status: InviteStatus }) => void;
  /** Выход из аккаунта: чужую переписку следующему пользователю не показываем. */
  reset: () => void;
}

const EMPTY_THREAD: Thread = { messages: [], loading: false, hasMore: false };

/** Сумма непрочитанного по всем беседам — общий бейдж «Друзья»/«Сообщения». */
export function totalUnread(conversations: Conversation[]): number {
  return conversations.reduce((sum, c) => sum + c.unreadCount, 0);
}

/** Бейджи не растягивают вёрстку: всё, что больше 9, показывается как «9+». */
export function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count);
}

export const useChatStore = create<ChatStore>()((set, get) => {
  /** Точечное обновление одного сообщения во всех загруженных тредах. */
  function patchMessage(messageId: number, patch: (m: ChatMessage) => ChatMessage): void {
    set((s) => {
      const threads: Record<number, Thread> = {};
      let changed = false;
      for (const [key, thread] of Object.entries(s.threads)) {
        const idx = thread.messages.findIndex((m) => m.id === messageId);
        if (idx === -1) {
          threads[Number(key)] = thread;
          continue;
        }
        changed = true;
        const messages = [...thread.messages];
        messages[idx] = patch(messages[idx]);
        threads[Number(key)] = { ...thread, messages };
      }
      const conversations = s.conversations.map((c) =>
        c.lastMessage && c.lastMessage.id === messageId
          ? { ...c, lastMessage: patch(c.lastMessage) }
          : c,
      );
      if (!changed && conversations === s.conversations) return s;
      return { ...s, threads, conversations };
    });
  }

  return {
    conversations: [],
    threads: {},
    activeThreadId: null,
    loaded: false,

    loadConversations: async () => {
      try {
        const { conversations } = await apiConversations();
        set({ conversations, loaded: true });
      } catch {
        /* временный сбой сети — оставляем прежний список */
      }
    },

    openThread: async (friendshipId) => {
      const existing = get().threads[friendshipId];
      if (existing?.loading) return;
      set((s) => ({
        threads: { ...s.threads, [friendshipId]: { ...(existing ?? EMPTY_THREAD), loading: true } },
      }));
      try {
        const { messages, hasMore } = await apiThreadMessages(friendshipId);
        set((s) => ({
          threads: {
            ...s.threads,
            // Сервер отдаёт от новых к старым — в ленте порядок обратный.
            [friendshipId]: { messages: [...messages].reverse(), loading: false, hasMore },
          },
        }));
      } catch {
        set((s) => ({
          threads: {
            ...s.threads,
            [friendshipId]: { ...(s.threads[friendshipId] ?? EMPTY_THREAD), loading: false },
          },
        }));
      }
    },

    loadMoreMessages: async (friendshipId) => {
      const thread = get().threads[friendshipId];
      if (!thread || thread.loading || !thread.hasMore || thread.messages.length === 0) return;
      const oldest = thread.messages[0].id;
      set((s) => ({
        threads: { ...s.threads, [friendshipId]: { ...thread, loading: true } },
      }));
      try {
        const { messages, hasMore } = await apiThreadMessages(friendshipId, oldest);
        set((s) => {
          const current = s.threads[friendshipId] ?? EMPTY_THREAD;
          return {
            threads: {
              ...s.threads,
              [friendshipId]: {
                messages: [...[...messages].reverse(), ...current.messages],
                loading: false,
                hasMore,
              },
            },
          };
        });
      } catch {
        set((s) => ({
          threads: {
            ...s.threads,
            [friendshipId]: { ...(s.threads[friendshipId] ?? EMPTY_THREAD), loading: false },
          },
        }));
      }
    },

    setActiveThread: (friendshipId) => set({ activeThreadId: friendshipId }),

    sendMessage: (friendshipId, text) => {
      const body = text.trim();
      if (!body) return;
      connectSocket().emit('chat:send', { friendshipId, text: body });
    },

    sendInvite: (friendshipId, timeControlId) => {
      connectSocket().emit('chat:invite', { friendshipId, timeControlId });
    },

    editMessage: (messageId, text) => {
      const body = text.trim();
      if (!body) return;
      connectSocket().emit('chat:edit', { messageId, text: body });
    },

    toggleReaction: (messageId, emoji) => {
      connectSocket().emit('chat:react', { messageId, emoji });
    },

    markRead: (friendshipId) => {
      // Оптимистично: цифра гаснет сразу, не дожидаясь ответа сервера.
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.friendshipId === friendshipId ? { ...c, unreadCount: 0 } : c,
        ),
      }));
      void apiMarkRead(friendshipId).catch(() => {
        /* сбой сети — при следующей загрузке списка счётчик восстановится */
      });
    },

    onMessage: (msg) => {
      const state = get();
      const myId = useAuthStore.getState().user?.id ?? null;
      const isMine = msg.senderId === myId;
      const isActive = state.activeThreadId === msg.friendshipId;

      set((s) => {
        const thread = s.threads[msg.friendshipId];
        const threads = thread
          ? {
              ...s.threads,
              [msg.friendshipId]: thread.messages.some((m) => m.id === msg.id)
                ? thread
                : { ...thread, messages: [...thread.messages, msg] },
            }
          : s.threads;
        const conversations = s.conversations.map((c) =>
          c.friendshipId === msg.friendshipId
            ? {
                ...c,
                lastMessage: msg,
                unreadCount: isMine || isActive ? c.unreadCount : c.unreadCount + 1,
              }
            : c,
        );
        return { threads, conversations };
      });

      // Беседа ещё не в списке (только что подружились) — подтянем список.
      if (!state.conversations.some((c) => c.friendshipId === msg.friendshipId)) {
        void get().loadConversations();
      }
      // Сообщение пришло в открытый тред — считается прочитанным на лету.
      if (isActive && !isMine) get().markRead(msg.friendshipId);
    },

    onMessageEdited: ({ messageId, text, editedAt }) => {
      patchMessage(messageId, (m) => ({ ...m, body: text, editedAt }));
    },

    onReactionUpdated: ({ messageId, reactions }) => {
      patchMessage(messageId, (m) => ({ ...m, reactions }));
    },

    onInviteStatusUpdated: ({ messageId, status }) => {
      patchMessage(messageId, (m) => ({ ...m, inviteStatus: status }));
    },

    reset: () => set({ conversations: [], threads: {}, activeThreadId: null, loaded: false }),
  };
});
