// @vitest-environment jsdom
/**
 * Клиентская часть чата: счётчики непрочитанного в сторе (включая правило
 * «пришло в открытый тред — не считается»), бейджи в меню и в списке друзей,
 * и отрисовка ленты сообщений с карточкой приглашения.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FriendsPage } from '../src/app/pages/FriendsPage';
import { MenuPage } from '../src/app/pages/MenuPage';
import { ChatThreadPage } from '../src/app/pages/ChatThreadPage';
import { useChatStore, totalUnread, badgeText } from '../src/app/store/chatStore';
import { useAuthStore } from '../src/app/store/authStore';
import { useGameStore } from '../src/app/store/gameStore';
import type { ChatMessage, Conversation } from '../src/app/api/chat';

const ME = { id: 1, username: 'alice', displayName: 'Алиса', avatarBase64: null, totpEnabled: false };
const BOB = { id: 2, username: 'bob', displayName: 'Боб', avatarBase64: null, totpEnabled: false };

const FRIENDS = {
  friends: [{ friendshipId: 5, user: BOB, online: true }],
  incoming: [],
  outgoing: [],
};

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 100,
    friendshipId: 5,
    senderId: BOB.id,
    kind: 'text',
    body: 'привет',
    inviteGameId: null,
    inviteTimeControlId: null,
    inviteRanked: false,
    inviteStatus: 'pending',
    editedAt: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    reactions: [],
    ...over,
  };
}

function conversation(over: Partial<Conversation> = {}): Conversation {
  return {
    friendshipId: 5,
    friend: { id: BOB.id, username: 'bob', displayName: 'Боб', rating: 1000 },
    online: true,
    unreadCount: 0,
    lastMessage: null,
    ...over,
  };
}

function mockNetwork(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const data = routes[url];
      return Promise.resolve({
        ok: data !== undefined,
        status: data !== undefined ? 200 : 404,
        text: () => Promise.resolve(JSON.stringify(data ?? { error: 'not_found' })),
      });
    }),
  );
}

beforeEach(() => {
  cleanup();
  useGameStore.setState({ lang: 'ru' });
  useAuthStore.setState({ status: 'authed', user: ME });
  useChatStore.setState({
    conversations: [],
    threads: {},
    activeThreadId: null,
    loaded: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chatStore unread bookkeeping', () => {
  it('counts a message that arrived while another screen was open', () => {
    mockNetwork({ '/api/csrf': { csrfToken: 'x' } });
    useChatStore.setState({ conversations: [conversation()], loaded: true });

    useChatStore.getState().onMessage(message({ body: 'ау' }));

    const [c] = useChatStore.getState().conversations;
    expect(c.unreadCount).toBe(1);
    expect(c.lastMessage?.body).toBe('ау');
    expect(totalUnread(useChatStore.getState().conversations)).toBe(1);
  });

  it('does not count a message arriving into the thread open on screen', () => {
    mockNetwork({ '/api/csrf': { csrfToken: 'x' }, '/api/chat/5/read': { ok: true } });
    useChatStore.setState({
      conversations: [conversation({ unreadCount: 3 })],
      activeThreadId: 5,
      loaded: true,
    });

    useChatStore.getState().onMessage(message());

    // Открытый тред: сообщение прочитано на лету, счётчик обнулён.
    expect(useChatStore.getState().conversations[0].unreadCount).toBe(0);
  });

  it('does not count my own echo of a sent message', () => {
    mockNetwork({ '/api/csrf': { csrfToken: 'x' } });
    useChatStore.setState({ conversations: [conversation()], loaded: true });

    useChatStore.getState().onMessage(message({ senderId: ME.id }));

    expect(useChatStore.getState().conversations[0].unreadCount).toBe(0);
  });

  it('applies edits, reactions and invite status to a loaded thread', () => {
    useChatStore.setState({
      conversations: [conversation()],
      threads: {
        5: {
          messages: [message(), message({ id: 101, kind: 'invite', inviteGameId: 7 })],
          loading: false,
          hasMore: false,
        },
      },
      loaded: true,
    });
    const store = useChatStore.getState();

    store.onMessageEdited({ messageId: 100, text: 'исправлено', editedAt: 'now' });
    store.onReactionUpdated({
      messageId: 100,
      reactions: [{ emoji: '👍', count: 1, reactedByMe: true }],
    });
    store.onInviteStatusUpdated({ messageId: 101, status: 'accepted' });

    const [text, invite] = useChatStore.getState().threads[5].messages;
    expect(text.body).toBe('исправлено');
    expect(text.editedAt).toBe('now');
    expect(text.reactions).toHaveLength(1);
    expect(invite.inviteStatus).toBe('accepted');
  });

  it('caps the badge label at 9+', () => {
    expect(badgeText(3)).toBe('3');
    expect(badgeText(9)).toBe('9');
    expect(badgeText(42)).toBe('9+');
  });
});

describe('entry points', () => {
  it('menu shows the total unread badge on Friends (no separate Messages entry)', () => {
    useChatStore.setState({
      conversations: [conversation({ unreadCount: 2 }), conversation({ friendshipId: 6, unreadCount: 3 })],
      loaded: true,
    });
    render(
      <MemoryRouter>
        <MenuPage />
      </MemoryRouter>,
    );

    // Чат живёт внутри «Друзей» — отдельного пункта «Сообщения» в меню больше нет.
    expect(screen.queryByText('Сообщения')).toBeNull();
    expect(screen.getByText('Друзья')).toBeTruthy();
    // Общий счётчик непрочитанного (2 + 3) — на «Друзьях», в одном месте.
    expect(screen.getAllByText('5')).toHaveLength(1);
  });

  it('friends list: a write button leads to the thread and shows a personal badge', async () => {
    mockNetwork({ '/api/friends': FRIENDS });
    useChatStore.setState({ conversations: [conversation({ unreadCount: 4 })], loaded: true });
    render(
      <MemoryRouter>
        <FriendsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Боб')).toBeTruthy();
    const write = screen.getByTitle('Написать сообщение');
    expect(write.getAttribute('href')).toBe('/chats/5');
    // Личная цифра именно этого друга, а не общая сумма.
    expect(screen.getByText('4')).toBeTruthy();
  });
});

describe('ChatThreadPage', () => {
  it('renders own and foreign bubbles, the edited mark and the invite card', async () => {
    mockNetwork({
      '/api/csrf': { csrfToken: 'x' },
      '/api/chat/5/read': { ok: true },
      '/api/chat/5/messages': {
        messages: [
          message({
            id: 102,
            senderId: ME.id,
            kind: 'invite',
            inviteGameId: 7,
            inviteTimeControlId: '3+2',
          }),
          message({ id: 101, senderId: ME.id, body: 'моё', editedAt: 'now' }),
          message({ id: 100, body: 'чужое' }),
        ],
        hasMore: false,
      },
    });

    render(
      <MemoryRouter initialEntries={['/chats/5']}>
        <Routes>
          <Route path="/chats/:friendshipId" element={<ChatThreadPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('чужое')).toBeTruthy();
    expect(screen.getByText('моё')).toBeTruthy();
    expect(screen.getByText('(изменено)')).toBeTruthy();
    // Своё приглашение показывает статус, а не кнопки принятия.
    expect(screen.getByText('Приглашение отправлено')).toBeTruthy();
    expect(screen.queryByText('Принять')).toBeNull();
    // Пока страница открыта, тред считается активным.
    expect(useChatStore.getState().activeThreadId).toBe(5);
  });

  it('shows accept/decline on an invite received from the friend', async () => {
    mockNetwork({
      '/api/csrf': { csrfToken: 'x' },
      '/api/chat/5/read': { ok: true },
      '/api/chat/5/messages': {
        messages: [
          message({ id: 103, kind: 'invite', inviteGameId: 8, inviteTimeControlId: 'none' }),
        ],
        hasMore: false,
      },
    });

    render(
      <MemoryRouter initialEntries={['/chats/5']}>
        <Routes>
          <Route path="/chats/:friendshipId" element={<ChatThreadPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Принять')).toBeTruthy();
    expect(screen.getByText('Отклонить')).toBeTruthy();
  });
});
