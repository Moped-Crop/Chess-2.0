import { useGameStore } from '../store/gameStore';
import { useT, useLang } from '../i18n';

/** Верхняя панель: бренд, переключатель языка и кнопка обучения. */
export function TopBar({ onHelp }: { onHelp: () => void }) {
  const t = useT();
  const lang = useLang();
  const setLang = useGameStore((s) => s.setLang);

  const uiTheme = useGameStore((s) => s.uiTheme);
  const setUiTheme = useGameStore((s) => s.setUiTheme);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path
              d="M12 2l2.4 4.8L19 5.4l-1.6 4.8L21 13l-4.4 1.6.8 5-5.4-2-5.4 2 .8-5L3 13l3.6-2.8L5 5.4l4.6 1.4z"
              fill="currentColor"
              opacity="0.9"
            />
          </svg>
        </span>
        <span className="brand-logo">
          Chess&nbsp;2<span className="brand-dot">·</span>ASCENT
        </span>
        <span className="brand-sub">{t('subtitle')}</span>
      </div>
      <div className="topbar-actions">
        <button
          className="theme-toggle"
          role="switch"
          aria-checked={uiTheme === 'light'}
          title={uiTheme === 'dark' ? t('lightTheme') : t('darkTheme')}
          onClick={() => setUiTheme(uiTheme === 'dark' ? 'light' : 'dark')}
        >
          <span className="theme-toggle-track">
            <svg className="icon-sun" viewBox="0 0 24 24" width="13" height="13" aria-hidden>
              <circle cx="12" cy="12" r="5" fill="currentColor" />
              <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1" />
              </g>
            </svg>
            <svg className="icon-moon" viewBox="0 0 24 24" width="13" height="13" aria-hidden>
              <path
                d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
                fill="currentColor"
              />
            </svg>
            <span className="theme-toggle-knob" />
          </span>
        </button>
        <div className="segmented lang-switch">
          <button className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>
            RU
          </button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
            EN
          </button>
        </div>
        <button className="btn btn-subtle" onClick={onHelp}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path
              d="M12 3L2 8l10 5 8.5-4.25V15h2V8L12 3zm-6 9.6V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.4l-6 3-6-3z"
              fill="currentColor"
            />
          </svg>
          {t('help')}
        </button>
      </div>
    </header>
  );
}
