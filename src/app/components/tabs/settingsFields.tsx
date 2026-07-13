/**
 * Переиспользуемые поля настроек: язык, тема доски, звук+громкость.
 * Используются и полной вкладкой SettingsTab (локальная игра), и урезанной
 * OnlineSettingsTab (онлайн-партия — без контроля времени и ориентации).
 */

import { useGameStore } from '../../store/gameStore';
import { THEMES } from '../../theme';
import { useT, useLang } from '../../i18n';

export function LanguageField() {
  const t = useT();
  const lang = useLang();
  return (
    <label className="field">
      <span className="field-label">{t('language')}</span>
      <select
        className="select"
        value={lang}
        onChange={(e) => useGameStore.getState().setLang(e.target.value as 'ru' | 'en')}
      >
        <option value="ru">Русский</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}

export function BoardThemeField() {
  const t = useT();
  const lang = useLang();
  const themeId = useGameStore((s) => s.themeId);
  const setTheme = useGameStore((s) => s.setTheme);
  return (
    <div className="field">
      <span className="field-label">{t('boardTheme')}</span>
      <div className="theme-swatches">
        {THEMES.map((th) => (
          <button
            key={th.id}
            className={`swatch ${themeId === th.id ? 'active' : ''}`}
            title={lang === 'en' ? th.labelEn : th.label}
            onClick={() => setTheme(th.id)}
          >
            <span className="swatch-board">
              <span style={{ background: th.light }} />
              <span style={{ background: th.dark }} />
              <span style={{ background: th.dark }} />
              <span style={{ background: th.light }} />
            </span>
            <span className="swatch-name">{lang === 'en' ? th.labelEn : th.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Звук: переключатель + громкость (два поля, как в исходной вкладке). */
export function SoundFields() {
  const t = useT();
  const muted = useGameStore((s) => s.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const volume = useGameStore((s) => s.volume);
  const setVolume = useGameStore((s) => s.setVolume);
  return (
    <>
      <div className="field field-row">
        <span className="field-label">{t('sound')}</span>
        <button
          className={`toggle ${muted ? '' : 'on'}`}
          role="switch"
          aria-checked={!muted}
          onClick={toggleMute}
        >
          <span className="toggle-knob" />
        </button>
      </div>

      <div className="field">
        <span className="field-label">
          {t('volume')} · {Math.round(volume * 100)}%
        </span>
        <input
          className="volume-slider"
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(volume * 100)}
          disabled={muted}
          aria-label={t('volume')}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
        />
      </div>
    </>
  );
}
