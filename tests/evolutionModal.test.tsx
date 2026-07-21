// @vitest-environment jsdom
/**
 * Окно выбора фигуры: при превращении пешки показываются только названия
 * фигур, при эволюции — названия и подсказки по движению форм.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EvolutionModal } from '../src/app/components/EvolutionModal';
import { useGameStore } from '../src/app/store/gameStore';
import { createInitialState } from '../src/engine';
import type { Move } from '../src/engine/types';

const PROMOTIONS: Move[] = (['Q', 'R', 'B', 'N', 'ROO'] as const).map((promotion) => ({
  from: 60,
  to: 70,
  promotion,
}));

const EVOLUTIONS: Move[] = (['R_RAM', 'R_ANCHOR'] as const).map((evolveTo) => ({
  from: 30,
  to: 50,
  evolveTo,
}));

function openChoice(kind: 'promotion' | 'evolution', moves: Move[]): void {
  useGameStore.setState({
    game: createInitialState(),
    pending: { from: moves[0].from, to: moves[0].to, moves, kind },
  });
}

describe('окно выбора фигуры', () => {
  beforeEach(() => {
    useGameStore.setState({ pending: null, lang: 'ru' });
  });
  afterEach(cleanup);

  it('превращение пешки: только названия, без подсказок по движению', () => {
    openChoice('promotion', PROMOTIONS);
    render(<EvolutionModal />);

    expect(screen.getByText('Ферзь')).toBeDefined();
    expect(screen.getByText('Петух')).toBeDefined();
    // Подсказка про ход Петуха здесь лишняя — ей место в справочнике.
    expect(document.querySelectorAll('.choice-hint')).toHaveLength(0);
  });

  it('эволюция: у каждой формы есть подсказка по движению', () => {
    openChoice('evolution', EVOLUTIONS);
    render(<EvolutionModal />);

    expect(screen.getByText('Таран')).toBeDefined();
    expect(screen.getByText('Опора')).toBeDefined();
    expect(document.querySelectorAll('.choice-hint')).toHaveLength(EVOLUTIONS.length);
  });
});
