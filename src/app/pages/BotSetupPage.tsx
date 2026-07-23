import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { Color } from '../../engine/types';
import { Brand } from '../components/Brand';
import { MiniPiece } from '../components/MiniPiece';
import type { BotDifficulty } from '../bot/protocol';
import { useT, type StrKey } from '../i18n';

type SideChoice = Color | 'random';

const LEVELS: { id: BotDifficulty; title: StrKey; sub: StrKey }[] = [
  { id: 'easy', title: 'botEasy', sub: 'botEasySub' },
  { id: 'medium', title: 'botMedium', sub: 'botMediumSub' },
  { id: 'hard', title: 'botHard', sub: 'botHardSub' },
];

/** Экран выбора сложности и стороны перед партией с ботом. */
export function BotSetupPage() {
  const t = useT();
  const navigate = useNavigate();

  const [difficulty, setDifficulty] = useState<BotDifficulty>('medium');
  const [side, setSide] = useState<SideChoice>('white');

  function start() {
    const color: Color = side === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : side;
    // Параметры партии живут в адресе: страница партии сама заводит её по ним.
    // Так партию не приходится «передавать» между экранами, и обновление
    // страницы не приводит на пустой экран.
    navigate(`/play/bot?level=${difficulty}&side=${color}`);
  }

  return (
    <div className="menu-page">
      <header className="topbar menu-topbar">
        <Brand />
        <div className="topbar-actions">
          <Link className="btn btn-ghost" to="/menu">
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> {t('menuBack')}
          </Link>
        </div>
      </header>

      <div className="card bot-setup">
        <h2 className="bot-setup-title">{t('botSetupTitle')}</h2>
        <p className="bot-setup-sub">{t('botSetupSub')}</p>

        <div className="field">
          <span className="field-label">{t('botDifficulty')}</span>
          <div className="bot-levels">
            {LEVELS.map((lv) => (
              <button
                key={lv.id}
                className={`bot-level ${difficulty === lv.id ? 'active' : ''}`}
                aria-pressed={difficulty === lv.id}
                onClick={() => setDifficulty(lv.id)}
              >
                <span className="bot-level-title">{t(lv.title)}</span>
                <span className="bot-level-sub">{t(lv.sub)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">{t('botColor')}</span>
          <div className="bot-sides">
            <button
              className={`bot-side ${side === 'white' ? 'active' : ''}`}
              aria-pressed={side === 'white'}
              onClick={() => setSide('white')}
            >
              <MiniPiece type="K" color="white" size={26} />
              {t('white')}
            </button>
            <button
              className={`bot-side ${side === 'black' ? 'active' : ''}`}
              aria-pressed={side === 'black'}
              onClick={() => setSide('black')}
            >
              <MiniPiece type="K" color="black" size={26} />
              {t('black')}
            </button>
            <button
              className={`bot-side ${side === 'random' ? 'active' : ''}`}
              aria-pressed={side === 'random'}
              onClick={() => setSide('random')}
            >
              <span className="bot-side-random" aria-hidden>
                ?
              </span>
              {t('botColorRandom')}
            </button>
          </div>
        </div>

        <button className="btn btn-primary btn-lg btn-block" onClick={start}>
          {t('botStart')}
        </button>
      </div>
    </div>
  );
}
