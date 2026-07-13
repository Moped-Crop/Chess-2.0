import { LanguageField, BoardThemeField, SoundFields } from './settingsFields';

/**
 * Вкладка «Настройки» в онлайн-партии: только язык, тема доски и звук.
 * Ни контроля времени (его задаёт приглашение), ни ориентации (своя сторона
 * всегда снизу) здесь нет — сознательно.
 */
export function OnlineSettingsTab() {
  return (
    <div className="tab-panel">
      <LanguageField />
      <BoardThemeField />
      <SoundFields />
    </div>
  );
}
