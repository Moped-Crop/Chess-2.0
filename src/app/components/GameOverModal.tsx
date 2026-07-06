import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { isKingInCheck, legalMoves } from '../../engine';
import { useT } from '../i18n';

/**
 * Окно «Конец партии»: появляется после мата, пата/ничьих и падения флага.
 * Показывает результат и причину, предлагает начать новую партию.
 */
export function GameOverModal() {
  const t = useT();
  const game = useGameStore((s) => s.game);
  const clock = useGameStore((s) => s.clock);
  const newGame = useGameStore((s) => s.newGame);

  const over = game.result !== 'ongoing';
  const [open, setOpen] = useState(false);

  // Открыть при завершении партии, закрыть при старте новой.
  useEffect(() => {
    setOpen(over);
  }, [over, game.result]);

  if (!over || !open) return null;

  const flagged = clock !== null && (clock.whiteMs <= 0 || clock.blackMs <= 0);
  let reason: string;
  if (game.result === 'draw') {
    reason = t('reasonDraw');
  } else if (flagged) {
    reason = t('reasonTime');
  } else {
    // Проигравший — тот, чья очередь хода; мат = он под шахом без ходов.
    const mate = isKingInCheck(game.board, game.turn) && legalMoves(game).length === 0;
    reason = mate ? t('reasonMate') : t('reasonTime');
  }

  const title =
    game.result === 'white' ? t('whiteWins') : game.result === 'black' ? t('blackWins') : t('draw');

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="modal gameover-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`gameover-icon ${game.result === 'draw' ? 'draw' : 'win'}`} aria-hidden>
          {game.result === 'draw' ? (
            <svg viewBox="0 0 24 24" width="34" height="34">
              <path
                d="M7 5h10v2.5c0 2.5-1.6 4.6-3.9 5.3.2.4.4.9.4 1.5V17h2.5v2H8v-2h2.5v-2.7c0-.6.2-1.1.4-1.5C8.6 12.1 7 10 7 7.5z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="34" height="34">
              <path
                d="M5 4h14v2h3v3c0 2.6-2 4.7-4.6 5-1 2-2.8 3.5-5 3.9V20h4v2H7.6v-2h4v-2.1c-2.2-.4-4-1.9-5-3.9C4 13.7 2 11.6 2 9V6h3zm-1 4v1c0 1.4.9 2.6 2.1 3A9 9 0 0 1 5 8zm16 0h-1a9 9 0 0 1-1.1 4c1.2-.4 2.1-1.6 2.1-3z"
                fill="currentColor"
              />
            </svg>
          )}
        </div>
        <h3 className="gameover-title">{title}</h3>
        <p className="gameover-reason">{reason}</p>
        <div className="gameover-actions">
          <button
            className="btn btn-primary btn-lg btn-block"
            onClick={() => {
              setOpen(false);
              newGame();
            }}
          >
            {t('newGame')}
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setOpen(false)}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
