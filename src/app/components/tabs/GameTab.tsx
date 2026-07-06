import { useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { serializeMatch, parseMatch } from '../../persistence/storage';
import { useT } from '../../i18n';

/** Вкладка «Партия»: управление матчем, отмена хода, экспорт/импорт. */
export function GameTab() {
  const t = useT();
  const game = useGameStore((s) => s.game);
  const moveLog = useGameStore((s) => s.moveLog);
  const captures = useGameStore((s) => s.captures);
  const canUndo = useGameStore((s) => s.past.length > 0 && s.clock === null);
  const newGame = useGameStore((s) => s.newGame);
  const undo = useGameStore((s) => s.undo);
  const loadMatch = useGameStore((s) => s.loadMatch);
  const fileRef = useRef<HTMLInputElement>(null);

  function onExport() {
    const blob = new Blob([serializeMatch(game, moveLog, captures)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess2-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const match = parseMatch(String(reader.result));
      if (match) loadMatch(match.game, match.moveLog, match.captures);
      else window.alert(t('importError'));
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="tab-panel">
      <button className="btn btn-primary btn-lg btn-block" onClick={newGame}>
        {t('newGame')}
      </button>
      <button
        className="btn btn-subtle btn-block"
        style={{ marginTop: 10 }}
        onClick={undo}
        disabled={!canUndo}
        title={canUndo ? '' : t('undoDisabled')}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
          <path
            d="M12 5V1L5 8l7 7v-4c3.9 0 7 3.1 7 7h2c0-5-4-9-9-9z"
            fill="currentColor"
            transform="translate(0 -1)"
          />
        </svg>
        {t('undo')}
      </button>

      <div className="section-divider" />

      <div className="field-label">{t('match')}</div>
      <div className="btn-row">
        <button className="btn btn-subtle" onClick={onExport}>
          {t('export')}
        </button>
        <button className="btn btn-subtle" onClick={() => fileRef.current?.click()}>
          {t('import')}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={onImport}
        style={{ display: 'none' }}
      />

      <div className="movecount">
        {t('moveNo')} {game.fullmove}
      </div>
    </div>
  );
}
