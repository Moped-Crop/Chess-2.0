import { useGameStore, type Orientation } from '../../store/gameStore';
import { PRESETS } from '../../clock/clock';
import { useT, useLang } from '../../i18n';
import { BoardThemeField, SoundFields } from './settingsFields';

/** Вкладка «Настройки» локальной игры: контроль времени, ориентация, тема,
 *  звук. Смена языка убрана — она есть в верхней панели (RU/EN), которая видна
 *  постоянно. Общие поля вынесены в settingsFields (их использует и
 *  OnlineSettingsTab), здесь остаются специфичные для локального режима. */
export function SettingsTab() {
  const t = useT();
  const lang = useLang();
  const presetId = useGameStore((s) => s.presetId);
  const setPreset = useGameStore((s) => s.setPreset);
  const orientation = useGameStore((s) => s.orientation);
  const setOrientation = useGameStore((s) => s.setOrientation);

  const ORIENTATIONS: { id: Orientation; label: string }[] = [
    { id: 'white', label: t('whiteBottom') },
    { id: 'black', label: t('blackBottom') },
    { id: 'auto', label: t('autoFlip') },
  ];

  return (
    <div className="tab-panel">
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

      <BoardThemeField />

      <SoundFields />
    </div>
  );
}
