// @vitest-environment jsdom
/**
 * Окно «Конец партии»: появляется при завершённой партии, показывает
 * правильный результат и причину (мат / ничья), скрыто в идущей партии.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GameOverModal } from '../src/app/components/GameOverModal';
import { useGameStore } from '../src/app/store/gameStore';
import { sq } from '../src/engine/board';
import { emptyBoard, makePiece, makeState } from './helpers';
import { createInitialState } from '../src/engine';

/** Матовая позиция: чёрный Кр a8, белый Ф b7 под защитой Кр c6, ход чёрных. */
function mateBoard() {
  const board = emptyBoard();
  board[sq(0, 7)] = makePiece('K', 'black');
  board[sq(1, 6)] = makePiece('Q', 'white');
  board[sq(2, 5)] = makePiece('K', 'white');
  return board;
}

describe('GameOverModal', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    useGameStore.setState({ clock: null, lang: 'ru' });
  });

  it('is hidden while the game is ongoing', () => {
    useGameStore.setState({ game: createInitialState() });
    render(<GameOverModal />);
    expect(screen.queryByText('Партия окончена')).toBeNull();
    expect(document.querySelector('.gameover-modal')).toBeNull();
  });

  it('shows the winner and «Мат» after checkmate', () => {
    useGameStore.setState({ game: makeState(mateBoard(), 'black', { result: 'white' }) });
    render(<GameOverModal />);
    expect(screen.getByText('Белые победили')).toBeTruthy();
    expect(screen.getByText('Мат')).toBeTruthy();
    expect(screen.getByText('Новая партия')).toBeTruthy();
  });

  it('shows a draw title and reason for a draw', () => {
    useGameStore.setState({ game: makeState(mateBoard(), 'black', { result: 'draw' }) });
    render(<GameOverModal />);
    expect(screen.getByText('Ничья')).toBeTruthy();
    expect(screen.getByText('Пат, повторение или правило 75 ходов')).toBeTruthy();
  });
});
