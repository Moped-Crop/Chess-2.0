import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { Color } from '../../engine/types';
import type { BotDifficulty } from '../bot/protocol';
import { Board } from '../components/Board';
import { PlayerBar } from '../components/PlayerBar';
import { StatusBanner } from '../components/StatusBanner';
import { BotGameTab } from '../components/tabs/BotGameTab';
import { BotSettingsTab } from '../components/tabs/BotSettingsTab';
import { MovesTab } from '../components/tabs/MovesTab';
import { EvolutionModal } from '../components/EvolutionModal';
import { GameOverModal } from '../components/GameOverModal';
import { Brand } from '../components/Brand';
import { useGameStore } from '../store/gameStore';
import { useBotWorker } from '../bot/useBotWorker';
import { useT, type StrKey } from '../i18n';

type SideTab = 'game' | 'moves' | 'settings';

const SIDE_TABS: { id: SideTab; key: StrKey }[] = [
  { id: 'game', key: 'tabGame' },
  { id: 'moves', key: 'tabMoves' },
  { id: 'settings', key: 'tabSettings' },
];

const LEVEL_KEY = { easy: 'botEasy', medium: 'botMedium', hard: 'botHard' } as const;

/**
 * Партия против бота. Доска, панели и модалки — те же, что в локальной игре:
 * стор просто работает в mode='bot'. Страница отвечает лишь за то, чтобы
 * вовремя попросить воркер посчитать ход и применить результат.
 */
export function BotGamePage() {
  const t = useT();
  const think = useBotWorker();
  const [params] = useSearchParams();

  const game = useGameStore((s) => s.game);
  const mode = useGameStore((s) => s.mode);
  const myColor = useGameStore((s) => s.myColor);
  const difficulty = useGameStore((s) => s.botDifficulty);
  const botThinking = useGameStore((s) => s.botThinking);
  const setBotThinking = useGameStore((s) => s.setBotThinking);

  const [tab, setTab] = useState<SideTab>('game');
  /** Идёт ли расчёт прямо сейчас. Ref, а не состояние: перерисовка не должна
   *  прерывать уже отправленный в воркер запрос. */
  const thinkingRef = useRef(false);

  const levelParam = params.get('level');
  const sideParam = params.get('side');
  const level: BotDifficulty | null =
    levelParam === 'easy' || levelParam === 'medium' || levelParam === 'hard' ? levelParam : null;
  const side: Color | null = sideParam === 'white' || sideParam === 'black' ? sideParam : null;

  // Партия заводится здесь, по параметрам адреса, и закрывается при уходе со
  // страницы. Одним эффектом, а не двумя: в режиме разработки React монтирует
  // компонент дважды (mount → cleanup → mount), и разнесённые «начать» и
  // «выйти» гасили бы друг друга — партия стиралась сразу после создания.
  useEffect(() => {
    if (level === null || side === null) return;
    useGameStore.getState().startBotGame(side, level);
    return () => useGameStore.getState().exitBotGame();
  }, [level, side]);

  useEffect(() => {
    if (mode !== 'bot' || myColor === null || difficulty === null) return;
    if (game.result !== 'ongoing') return;
    if (game.turn === myColor) return; // сейчас ходит человек
    if (thinkingRef.current) return;

    thinkingRef.current = true;
    setBotThinking(true);
    const forGame = game;
    void think(forGame, difficulty).then((res) => {
      thinkingRef.current = false;
      const store = useGameStore.getState();
      // Пока бот думал, позиция могла смениться (новая партия, сдача) —
      // такой ответ применять нельзя. Сравнение по ссылке надёжно: стор
      // заменяет объект партии на каждом ходу.
      if (store.mode !== 'bot' || store.game !== forGame) {
        store.setBotThinking(false);
        return;
      }
      if (res.move) store.applyConfirmedMove(res.move);
      store.setBotThinking(false);
    });
  }, [game, mode, myColor, difficulty, think, setBotThinking]);

  // Адрес без корректных параметров (например, зашли по /play/bot руками) —
  // отправляем выбирать сложность.
  if (level === null || side === null) return <Navigate to="/play/bot/setup" replace />;
  // Первый кадр до того, как эффект успел завести партию, — ещё локальный стор.
  if (mode !== 'bot' || myColor === null || difficulty === null) return null;

  const botColor: Color = myColor === 'white' ? 'black' : 'white';
  const botLabel = `${t('botName')} · ${t(LEVEL_KEY[difficulty])}`;

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <Link className="btn btn-ghost" to="/menu">
            ← {t('menuBack')}
          </Link>
        </div>
      </header>

      <div className="main">
        <div className="board-col">
          <PlayerBar color={botColor} displayName={botLabel} />
          <div className="card board-card">
            <Board />
          </div>
          <PlayerBar color={myColor} />
        </div>

        <aside className="sidebar">
          <div className="card sidebar-card">
            <StatusBanner />
            {botThinking && (
              <div className="bot-thinking" role="status">
                <span className="bot-thinking-dot" aria-hidden />
                {t('botThinking')}
              </div>
            )}
            <div className="section-divider" />
            <div className="segmented segmented-block tabbar">
              {SIDE_TABS.map((tb) => (
                <button
                  key={tb.id}
                  className={tab === tb.id ? 'active' : ''}
                  onClick={() => setTab(tb.id)}
                >
                  {t(tb.key)}
                </button>
              ))}
            </div>
            <div className="tab-panel-wrap" key={tab}>
              {tab === 'game' && <BotGameTab />}
              {tab === 'moves' && <MovesTab />}
              {tab === 'settings' && <BotSettingsTab />}
            </div>
          </div>
        </aside>
      </div>

      <EvolutionModal />
      <GameOverModal />
    </div>
  );
}
