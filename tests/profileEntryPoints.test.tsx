// @vitest-environment jsdom
/**
 * Точки входа в профиль другого игрока: список друзей и история партий.
 * Главное, что здесь проверяется, — клик по имени ведёт на профиль, а клик
 * по кнопкам действий и по остальной части строки истории — нет.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FriendsPage } from '../src/app/pages/FriendsPage';
import { GameHistoryPage } from '../src/app/pages/GameHistoryPage';
import { useGameStore } from '../src/app/store/gameStore';

const BOB = { id: 2, username: 'bob', displayName: 'Боб', avatarBase64: null, totpEnabled: false };

const FRIENDS = {
  friends: [{ friendshipId: 5, user: BOB, online: true }],
  incoming: [],
  outgoing: [],
};

const HISTORY = {
  games: [
    {
      id: 42,
      opponent: { username: 'bob', displayName: 'Боб', avatarBase64: null },
      myColor: 'white',
      result: 'white',
      winReason: 'game',
      timeControlId: '5+3',
      finishedAt: '2026-07-01T10:00:00.000Z',
    },
  ],
  hasMore: false,
};

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

/** Ссылка, внутри которой лежит переданный текст. */
function linkAround(text: string): string | null | undefined {
  return screen.getByText(text).closest('a')?.getAttribute('href');
}

describe('entry points to a player profile', () => {
  beforeEach(() => {
    cleanup();
    useGameStore.setState({ lang: 'ru' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('friends list: the name links to the profile, action buttons do not', async () => {
    mockNetwork({ '/api/friends': FRIENDS });
    render(
      <MemoryRouter>
        <FriendsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Боб')).toBeTruthy();
    expect(linkAround('Боб')).toBe('/players/bob');
    // Кнопки — соседи ссылки, а не её содержимое: клик по ним профиль не откроет.
    expect(screen.getByText('Удалить').closest('a')).toBeNull();
    expect(screen.getByText(/В игру/).closest('a')).toBeNull();
  });

  it('history: the row opens the replay, the opponent name opens the profile', async () => {
    mockNetwork({ '/api/games/history?page=1': HISTORY });
    render(
      <MemoryRouter>
        <GameHistoryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Боб')).toBeTruthy();
    expect(linkAround('Боб')).toBe('/players/bob');
    // Растянутая ссылка строки по-прежнему ведёт на повтор партии.
    expect(document.querySelector('.history-open')?.getAttribute('href')).toBe('/history/42');
    // Бейдж результата не должен утаскивать на профиль.
    expect(screen.getByText('Победа').closest('a')).toBeNull();
  });
});
