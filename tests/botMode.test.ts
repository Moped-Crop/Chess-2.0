// @vitest-environment jsdom
/**
 * Режим партии с ботом на уровне стора: заведение партии, запрет ходить за
 * бота, сдача, выход. Отдельно закреплено главное обещание режима — партия с
 * ботом никуда не сохраняется.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../src/app/store/gameStore';
import { createInitialState, legalMoves } from '../src/engine';

const AUTOSAVE_KEY = 'ascent.autosave';

function reset(): void {
  localStorage.clear();
  const fresh = createInitialState();
  useGameStore.setState({
    game: fresh,
    past: [],
    selected: null,
    legal: legalMoves(fresh),
    pending: null,
    mode: 'local',
    myColor: null,
    botDifficulty: null,
    botThinking: false,
    moveLog: [],
    captures: [],
    clock: null,
  });
}

describe('партия с ботом', () => {
  beforeEach(reset);

  it('startBotGame заводит партию: режим, цвет человека, сложность, без часов', () => {
    useGameStore.getState().startBotGame('black', 'hard');
    const s = useGameStore.getState();
    expect(s.mode).toBe('bot');
    expect(s.myColor).toBe('black');
    expect(s.botDifficulty).toBe('hard');
    expect(s.clock).toBeNull(); // партии с ботом играются без часов
    expect(s.orientation).toBe('black'); // своя сторона снизу
    expect(s.game.turn).toBe('white'); // ходит бот
    expect(s.moveLog).toHaveLength(0);
  });

  it('человек не может ходить за бота', () => {
    useGameStore.getState().startBotGame('black', 'medium');
    // Сейчас очередь белых, то есть бота: клик по белой фигуре игнорируется.
    useGameStore.getState().clickSquare(11); // белая пешка b2
    expect(useGameStore.getState().selected).toBeNull();
  });

  it('доска не отвечает, пока бот думает', () => {
    useGameStore.getState().startBotGame('white', 'medium');
    useGameStore.setState({ botThinking: true });
    useGameStore.getState().clickSquare(11); // своя белая пешка
    expect(useGameStore.getState().selected).toBeNull();

    useGameStore.getState().setBotThinking(false);
    useGameStore.getState().clickSquare(11);
    expect(useGameStore.getState().selected).toBe(11);
  });

  it('сдача отдаёт победу цвету бота', () => {
    useGameStore.getState().startBotGame('white', 'easy');
    useGameStore.getState().resignBotGame();
    const s = useGameStore.getState();
    expect(s.game.result).toBe('black'); // человек играл белыми
    expect(s.legal).toHaveLength(0);
    expect(s.botThinking).toBe(false);
  });

  it('сдача в чужом режиме и в законченной партии ничего не делает', () => {
    useGameStore.getState().resignBotGame(); // mode='local'
    expect(useGameStore.getState().game.result).toBe('ongoing');

    useGameStore.getState().startBotGame('white', 'easy');
    useGameStore.getState().resignBotGame();
    useGameStore.getState().resignBotGame(); // повторно — результат не меняется
    expect(useGameStore.getState().game.result).toBe('black');
  });

  it('выход возвращает локальный режим и чистит состояние бота', () => {
    useGameStore.getState().startBotGame('black', 'hard');
    useGameStore.getState().exitBotGame();
    const s = useGameStore.getState();
    expect(s.mode).toBe('local');
    expect(s.myColor).toBeNull();
    expect(s.botDifficulty).toBeNull();
    expect(s.botThinking).toBe(false);
  });

  it('ходы в партии с ботом НЕ попадают в автосохранение', () => {
    useGameStore.getState().startBotGame('white', 'easy');
    const move = legalMoves(useGameStore.getState().game)[0];
    useGameStore.getState().applyConfirmedMove(move);

    expect(useGameStore.getState().moveLog).toHaveLength(1); // ход применён
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull(); // но не сохранён
  });

  it('локальная партия по-прежнему сохраняется — режим бота её не сломал', () => {
    const move = legalMoves(useGameStore.getState().game)[0];
    useGameStore.getState().applyConfirmedMove(move); // mode='local'
    expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull();
  });
});
