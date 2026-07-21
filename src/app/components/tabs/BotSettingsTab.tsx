import { LanguageField, BoardThemeField, SoundFields } from './settingsFields';

/**
 * Вкладка «Настройки» в партии с ботом: язык, тема доски и звук.
 *
 * Ни контроля времени (партии с ботом играются без часов), ни ориентации
 * доски — как и в онлайне, свой цвет всегда снизу, соперник сверху. Выбор
 * ориентации осмыслен только в игре за одним устройством, где доску по
 * очереди видят оба игрока.
 */
export function BotSettingsTab() {
  return (
    <div className="tab-panel">
      <LanguageField />
      <BoardThemeField />
      <SoundFields />
    </div>
  );
}
