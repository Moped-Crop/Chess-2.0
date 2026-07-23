import { Trophy } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { isKingInCheck } from '../../engine';
import { useT } from '../i18n';

/** Постоянный индикатор состояния партии над вкладками. */
export function StatusBanner() {
  const t = useT();
  const game = useGameStore((s) => s.game);
  const over = game.result !== 'ongoing';
  const inCheck = !over && isKingInCheck(game.board, game.turn);

  let text: string;
  if (game.result === 'white') text = t('whiteWins');
  else if (game.result === 'black') text = t('blackWins');
  else if (game.result === 'draw') text = t('draw');
  else text = game.turn === 'white' ? t('whiteToMove') : t('blackToMove');

  const cls = over ? 'over' : inCheck ? 'check' : '';

  return (
    <div className={`status ${cls}`} key={`${game.result}-${game.turn}-${inCheck}`}>
      <span className="pip" />
      <span className="status-text">
        {text}
        {inCheck ? ' · ' + t('check') : ''}
      </span>
      {over && game.result !== 'draw' && (
        <span className="status-trophy" aria-hidden>
          <Trophy size={18} strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}
