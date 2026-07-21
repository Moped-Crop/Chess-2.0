import { useGameStore, type Orientation } from '../../store/gameStore';
import { useT } from '../../i18n';
import { LanguageField, BoardThemeField, SoundFields } from './settingsFields';

/**
 * Вкладка «Настройки» в партии с ботом: язык, ориентация доски, тема и звук.
 * Контроля времени нет — партии с ботом играются без часов.
 */
export function BotSettingsTab() {
  const t = useT();
  const orientation = useGameStore((s) => s.orientation);
  const setOrientation = useGameStore((s) => s.setOrientation);

  const ORIENTATIONS: { id: Orientation; label: string }[] = [
    { id: 'white', label: t('whiteBottom') },
    { id: 'black', label: t('blackBottom') },
    { id: 'auto', label: t('autoFlip') },
  ];

  return (
    <div className="tab-panel">
      <LanguageField />

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
