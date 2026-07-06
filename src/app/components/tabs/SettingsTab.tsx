import { useGameStore, type Orientation } from '../../store/gameStore';
import { PRESETS } from '../../clock/clock';
import { THEMES } from '../../theme';
import { useT, useLang } from '../../i18n';

/** Вкладка «Настройки»: язык, контроль времени, ориентация, тема, звук. */
export function SettingsTab() {
  const t = useT();
  const lang = useLang();
  const presetId = useGameStore((s) => s.presetId);
  const setPreset = useGameStore((s) => s.setPreset);
  const orientation = useGameStore((s) => s.orientation);
  const setOrientation = useGameStore((s) => s.setOrientation);
  const themeId = useGameStore((s) => s.themeId);
  const setTheme = useGameStore((s) => s.setTheme);
  const muted = useGameStore((s) => s.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const volume = useGameStore((s) => s.volume);
  const setVolume = useGameStore((s) => s.setVolume);

  const ORIENTATIONS: { id: Orientation; label: string }[] = [
    { id: 'white', label: t('whiteBottom') },
    { id: 'black', label: t('blackBottom') },
    { id: 'auto', label: t('autoFlip') },
  ];

  return (
    <div className="tab-panel">
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

      <label className="field">
        <span className="field-label">{t('timeControl')}</span>
        <select className="select" value={presetId} onChange={(e) => setPreset(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {lang === 'en' ? p.labelEn : p.label}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span className="field-label">{t('boardOrientation')}</span>
        <div className="segmented segmented-block">
          {ORIENTATIONS.map((o) => (
            <button
              key={o.id}
              className={orientation === o.id ? 'active' : ''}
              onClick={() => setOrientation(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

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
    </div>
  );
}
