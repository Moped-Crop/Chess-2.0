import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { MoveEntry } from '../../notation';
import { MiniPiece } from '../MiniPiece';
import { useT } from '../../i18n';

function MoveCell({ entry }: { entry?: MoveEntry }) {
  if (!entry) return <span className="move-cell empty" />;
  return (
    <span className="move-cell">
      <MiniPiece type={entry.pieceType} color={entry.color} size={20} />
      <span className="move-san">{entry.san}</span>
    </span>
  );
}

/** Вкладка «Ходы»: запись партии парами с иконками фигур и автопрокруткой. */
export function MovesTab() {
  const t = useT();
  const log = useGameStore((s) => s.moveLog);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  if (log.length === 0) {
    return (
      <div className="tab-panel">
        <p className="history-empty">{t('noMoves')}</p>
      </div>
    );
  }

  const rows: { n: number; white: MoveEntry; black?: MoveEntry }[] = [];
  for (let i = 0; i < log.length; i += 2) {
    rows.push({ n: i / 2 + 1, white: log[i], black: log[i + 1] });
  }

  return (
    <div className="tab-panel">
      <div className="moves" ref={listRef}>
        {rows.map((r) => (
          <div className="move-row" key={r.n}>
            <span className="move-no">{r.n}</span>
            <MoveCell entry={r.white} />
            <MoveCell entry={r.black} />
          </div>
        ))}
      </div>
    </div>
  );
}
