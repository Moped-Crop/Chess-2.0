import { useGameStore } from '../store/gameStore';
import { PIECE_NAME, PIECE_NAME_EN, FORM_HINT, FORM_HINT_EN } from '../pieceMeta';
import type { Move, PieceType } from '../../engine/types';
import { useT, useLang } from '../i18n';
import { MiniPiece } from './MiniPiece';

/**
 * Окно выбора: форма эволюции (событие с золотым оформлением) или фигура
 * превращения пешки (сетка из 5 карточек). Появляется только когда у игрока
 * есть настоящий выбор (см. gameStore.clickSquare).
 */
export function EvolutionModal() {
  const t = useT();
  const lang = useLang();
  const pending = useGameStore((s) => s.pending);
  const resolve = useGameStore((s) => s.resolveChoice);
  const cancel = useGameStore((s) => s.cancelChoice);
  const turn = useGameStore((s) => s.game.turn);

  if (!pending || pending.moves.length === 0) return null;

  const isEvo = pending.kind === 'evolution';
  const keyOf = (m: Move): PieceType => (isEvo ? m.evolveTo! : m.promotion!);
  const nameOf = (pt: PieceType) => (lang === 'en' ? PIECE_NAME_EN[pt] : PIECE_NAME[pt]);
  const hintOf = (pt: PieceType) => (lang === 'en' ? FORM_HINT_EN[pt] : FORM_HINT[pt]);

  return (
    <div className="overlay" onClick={cancel}>
      <div
        className={`modal choice-modal ${isEvo ? 'evo-modal' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {isEvo && <div className="evo-halo" aria-hidden />}
        <div className="choice-head">
          {isEvo && <span className="evo-badge">{t('evolutionEvent')}</span>}
          <h3>{isEvo ? t('chooseEvolution') : t('choosePromotion')}</h3>
          <p className="choice-sub">{isEvo ? t('evolutionSub') : t('promotionSub')}</p>
        </div>

        <div className={`choice-grid ${isEvo ? 'grid-evo' : 'grid-promo'}`}>
          {pending.moves.map((m, i) => {
            const pt = keyOf(m);
            const hint = hintOf(pt);
            return (
              <button
                key={i}
                className={`choice-card ${isEvo ? 'choice-evo' : ''}`}
                style={{ animationDelay: `${80 + i * 60}ms` }}
                onClick={() => resolve(m)}
              >
                <span className="choice-piece">
                  <MiniPiece type={pt} color={turn} size={isEvo ? 64 : 52} />
                </span>
                <span className="choice-name">{nameOf(pt)}</span>
                {hint && <span className="choice-hint">{hint}</span>}
              </button>
            );
          })}
        </div>

        <button className="btn btn-ghost btn-block cancel" onClick={cancel}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
