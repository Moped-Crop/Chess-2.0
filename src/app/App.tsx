import { useEffect, useState } from 'react';
import { Board } from './components/Board';
import { TopBar } from './components/TopBar';
import { PlayerBar } from './components/PlayerBar';
import { StatusBanner } from './components/StatusBanner';
import { GameTab } from './components/tabs/GameTab';
import { MovesTab } from './components/tabs/MovesTab';
import { SettingsTab } from './components/tabs/SettingsTab';
import { EvolutionModal } from './components/EvolutionModal';
import { GameOverModal } from './components/GameOverModal';
import { Tutorial } from './components/Tutorial';
import { useGameStore } from './store/gameStore';
import { useClockTicker } from './useClockTicker';
import { useT, type StrKey } from './i18n';

type Tab = 'game' | 'moves' | 'settings';

const TABS: { id: Tab; key: StrKey }[] = [
  { id: 'game', key: 'tabGame' },
  { id: 'moves', key: 'tabMoves' },
  { id: 'settings', key: 'tabSettings' },
];

export function App() {
  const t = useT();
  const [showTutorial, setShowTutorial] = useState(false);
  const [tab, setTab] = useState<Tab>('game');

  useClockTicker();

  // Светлая/тёмная тема применяется на уровне документа (CSS-токены).
  const uiTheme = useGameStore((s) => s.uiTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
  }, [uiTheme]);

  const orientation = useGameStore((s) => s.orientation);
  const turn = useGameStore((s) => s.game.turn);
  const flipped = orientation === 'black' || (orientation === 'auto' && turn === 'black');
  const bottomColor = flipped ? 'black' : 'white';
  const topColor = flipped ? 'white' : 'black';

  return (
    <div className="app">
      <TopBar onHelp={() => setShowTutorial(true)} />

      <div className="main">
        <div className="board-col">
          <PlayerBar color={topColor} />
          <div className="card board-card">
            <Board />
          </div>
          <PlayerBar color={bottomColor} />
        </div>

        <aside className="sidebar">
          <div className="card sidebar-card">
            <StatusBanner />
            <div className="segmented segmented-block tabbar">
              {TABS.map((tb) => (
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
              {tab === 'game' && <GameTab />}
              {tab === 'moves' && <MovesTab />}
              {tab === 'settings' && <SettingsTab />}
            </div>
          </div>
          <p className="footnote">{t('footnote')}</p>
        </aside>
      </div>

      <EvolutionModal />
      <GameOverModal />
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
