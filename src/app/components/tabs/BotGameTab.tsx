import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore';
import { useT } from '../../i18n';

/**
 * Вкладка «Партия» в игре с ботом: сдаться и начать заново.
 *
 * Отмены хода здесь нет намеренно: откат одного полухода вернул бы очередь
 * боту, и он тут же походил бы снова — кнопка выглядела бы сломанной.
 * Экспорта/импорта тоже нет — партия с ботом никуда не сохраняется.
 */
export function BotGameTab() {
  const t = useT();
  const navigate = useNavigate();
  const result = useGameStore((s) => s.game.result);
  const fullmove = useGameStore((s) => s.game.fullmove);
  const resignBotGame = useGameStore((s) => s.resignBotGame);
  const [confirmResign, setConfirmResign] = useState(false);

  function resign() {
    // Двухшаговое подтверждение — тот же приём, что в онлайн-партии.
    if (!confirmResign) {
      setConfirmResign(true);
      window.setTimeout(() => setConfirmResign(false), 4000);
      return;
    }
    setConfirmResign(false);
    resignBotGame();
  }

  return (
    <div className="tab-panel">
      <button
        className="btn btn-primary btn-lg btn-block"
        onClick={() => navigate('/play/bot/setup')}
      >
        {t('botNewGame')}
      </button>

      {result === 'ongoing' && (
        <button
          className={`btn btn-block ${confirmResign ? 'btn-danger' : 'btn-subtle'}`}
          style={{ marginTop: 10 }}
          onClick={resign}
        >
          {confirmResign ? t('resignConfirm') : t('resignBtn')}
        </button>
      )}

      <div className="movecount">
        {t('moveNo')} {fullmove}
      </div>
    </div>
  );
}
