// @vitest-environment jsdom
/**
 * Имя в панели игрока — ссылка на профиль ТОЛЬКО когда передан username
 * (онлайн-партия). Хотсит, партия с ботом и обучение его не передают, и
 * ссылки там появляться не должно.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { PlayerBar } from '../src/app/components/PlayerBar';
import { useGameStore } from '../src/app/store/gameStore';
import { createInitialState } from '../src/engine';

function renderBar(el: ReactElement) {
  return render(<MemoryRouter>{el}</MemoryRouter>);
}

describe('PlayerBar', () => {
  beforeEach(() => {
    cleanup();
    useGameStore.setState({ game: createInitialState(), clock: null, captures: [], lang: 'ru' });
  });

  it('links the opponent name to the profile when a username is given', () => {
    renderBar(<PlayerBar color="black" displayName="Боб" username="bob" />);
    expect(screen.getByText('Боб').closest('a')?.getAttribute('href')).toBe('/players/bob');
  });

  it('keeps the name plain text without a username (hotseat, bot, tutorial)', () => {
    renderBar(<PlayerBar color="black" />);
    expect(screen.getByText('Чёрные')).toBeTruthy();
    expect(document.querySelector('.player a')).toBeNull();
  });

  it('a real display name without a username is still not a link', () => {
    renderBar(<PlayerBar color="white" displayName="Игрок 1" />);
    expect(screen.getByText('Игрок 1').closest('a')).toBeNull();
  });
});
