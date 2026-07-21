// @vitest-environment jsdom
/**
 * Профиль другого игрока: четыре состояния блока отношения, карточка
 * удалённого аккаунта, ненайденный игрок и редирект со своего ника на
 * редактируемый `/profile`. Сеть подменена — страница проверяется целиком,
 * вместе с реальными вызовами api-клиента.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlayerProfilePage } from '../src/app/pages/PlayerProfilePage';
import { useAuthStore } from '../src/app/store/authStore';
import { useGameStore } from '../src/app/store/gameStore';
import type { PlayerCard } from '../src/app/api/players';
import type { FriendsList } from '../src/app/api/friends';

const ME = {
  id: 1,
  username: 'alice',
  displayName: 'Алиса',
  avatarBase64: null,
  totpEnabled: false,
};

const BOB: PlayerCard = {
  deleted: false,
  id: 2,
  username: 'bob',
  displayName: 'Боб',
  avatarBase64: null,
  online: true,
  stats: { wins: 3, losses: 1, draws: 2, gamesPlayed: 6 },
};

const EMPTY_FRIENDS: FriendsList = { friends: [], incoming: [], outgoing: [] };

const bobEntry = (friendshipId: number) => ({
  friendshipId,
  user: { id: 2, username: 'bob', displayName: 'Боб', avatarBase64: null, totpEnabled: false },
  online: true,
});

/** Последние POST-запросы — чтобы проверить, что кнопка реально дёргает API. */
let posted: { url: string; body: unknown }[] = [];

/**
 * Подменённая сеть. `player` — ответ профиля, `friends` — список друзей;
 * список можно подменить прямо во время теста (после принятия заявки).
 */
function mockNetwork(player: PlayerCard | 'not_found', friends: () => FriendsList) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      const json = (status: number, data: unknown) =>
        Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(data)) });

      if (init?.method && init.method !== 'GET') {
        posted.push({ url, body: init.body ? JSON.parse(init.body) : null });
        return json(200, { ok: true, friendshipId: 9 });
      }
      if (url === '/api/csrf') return json(200, { csrfToken: 'test-csrf' });
      if (url.startsWith('/api/players/')) {
        return player === 'not_found'
          ? json(404, { error: 'not_found' })
          : json(200, player);
      }
      if (url === '/api/friends') return json(200, friends());
      return json(404, { error: 'not_found' });
    }),
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/players/:username" element={<PlayerProfilePage />} />
        <Route path="/profile" element={<p>СВОЙ ПРОФИЛЬ</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlayerProfilePage', () => {
  beforeEach(() => {
    cleanup();
    posted = [];
    useGameStore.setState({ lang: 'ru' });
    useAuthStore.setState({ status: 'authed', user: ME });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the card: name, @username, online status and stats', async () => {
    mockNetwork(BOB, () => EMPTY_FRIENDS);
    renderAt('/players/bob');

    expect(await screen.findByText('Боб')).toBeTruthy();
    expect(screen.getByText('@bob')).toBeTruthy();
    expect(screen.getByText('в сети')).toBeTruthy();
    // Статистика — тот же общий блок, что и в своём профиле.
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('Сыграно партий')).toBeTruthy();
  });

  it('no relation → «Добавить в друзья» sends the request', async () => {
    mockNetwork(BOB, () => EMPTY_FRIENDS);
    renderAt('/players/bob');

    fireEvent.click(await screen.findByText('Добавить в друзья'));
    await screen.findByText('Боб');
    expect(posted).toEqual([
      { url: '/api/friends/request', body: { username: 'bob' } },
    ]);
  });

  it('outgoing request → «Заявка отправлена», no add button', async () => {
    mockNetwork(BOB, () => ({ ...EMPTY_FRIENDS, outgoing: [bobEntry(5)] }));
    renderAt('/players/bob');

    expect(await screen.findByText('Заявка отправлена ✓')).toBeTruthy();
    expect(screen.queryByText('Добавить в друзья')).toBeNull();
  });

  it('already friends → «Уже в друзьях», no add button', async () => {
    mockNetwork(BOB, () => ({ ...EMPTY_FRIENDS, friends: [bobEntry(5)] }));
    renderAt('/players/bob');

    expect(await screen.findByText(/Уже в друзьях/)).toBeTruthy();
    expect(screen.queryByText('Добавить в друзья')).toBeNull();
  });

  it('incoming request → accept works right from the profile', async () => {
    // После принятия сервер отдаёт уже другой список — проверяем переход состояния.
    let accepted = false;
    mockNetwork(BOB, () =>
      accepted
        ? { ...EMPTY_FRIENDS, friends: [bobEntry(5)] }
        : { ...EMPTY_FRIENDS, incoming: [bobEntry(5)] },
    );
    renderAt('/players/bob');

    expect(await screen.findByText('Этот игрок отправил вам заявку в друзья')).toBeTruthy();
    accepted = true;
    fireEvent.click(screen.getByText('Принять'));

    expect(await screen.findByText(/Уже в друзьях/)).toBeTruthy();
    expect(posted).toEqual([{ url: '/api/friends/accept', body: { friendshipId: 5 } }]);
  });

  it('deleted account → stub card without stats or relation block', async () => {
    mockNetwork({ deleted: true, id: 2, username: 'deleted_user_2' }, () => EMPTY_FRIENDS);
    renderAt('/players/deleted_user_2');

    expect(await screen.findByText('Этот аккаунт был удалён')).toBeTruthy();
    expect(screen.queryByText('Статистика')).toBeNull();
    expect(screen.queryByText('Добавить в друзья')).toBeNull();
  });

  it('unknown player → clear error instead of an empty page', async () => {
    mockNetwork('not_found', () => EMPTY_FRIENDS);
    renderAt('/players/nobody99');

    expect(await screen.findByText('Игрок с таким логином не найден')).toBeTruthy();
  });

  it('own username redirects to the editable /profile', async () => {
    mockNetwork(BOB, () => EMPTY_FRIENDS);
    renderAt('/players/alice');

    expect(await screen.findByText('СВОЙ ПРОФИЛЬ')).toBeTruthy();
  });
});
