import { Link } from 'react-router-dom';
import type { Color, GameResult } from '../../engine/types';
import type { GamePlayer } from '../api/games';
import { presetById } from '../clock/clock';
import { useT, useLang } from '../i18n';
import { Avatar } from './Avatar';
import { RatingBadge } from './RatingBadge';

/** Строка списка — с точки зрения игрока, чью историю смотрим. */
export interface GameRow {
  id: number;
  opponent: GamePlayer;
  playerColor: Color;
  result: GameResult | null;
  timeControlId: string | null;
  finishedAt: string | null;
  /** Рейтинговая ли партия — бейдж «Рейтинговая»/«Обычная». */
  isRanked: boolean;
  /** Изменение рейтинга игрока (null для нерейтинговых). */
  ratingDelta: number | null;
}

/** «+18» / «−12» с цветом; null не показывается. */
function DeltaTag({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return <span className={`rating-delta ${cls}`}>{delta > 0 ? `+${delta}` : String(delta)}</span>;
}

/**
 * Список завершённых партий: бейдж результата, соперник, контроль, дата.
 * Общий для своей истории (`/history`) и для профиля другого игрока.
 *
 * `from` — ник владельца истории; передаётся только на чужом профиле и уходит
 * в ссылку повтора, чтобы тот открылся с его стороны доски и вернул назад в
 * его профиль, а не в твою историю.
 */
export function GamesList({
  games,
  loading,
  hasMore,
  onMore,
  emptyText,
  from,
}: {
  games: GameRow[];
  loading: boolean;
  hasMore: boolean;
  onMore: () => void;
  emptyText: string;
  from?: string;
}) {
  const t = useT();
  const lang = useLang();

  function badge(g: GameRow): { cls: string; label: string } {
    if (g.result === 'draw') return { cls: 'draw', label: t('historyDraw') };
    if (g.result === g.playerColor) return { cls: 'win', label: t('historyWin') };
    return { cls: 'loss', label: t('historyLoss') };
  }

  function tcLabel(id: string | null): string {
    if (!id) return '—';
    const p = presetById(id);
    return lang === 'en' ? p.labelEn : p.label;
  }

  function dateLabel(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  const replayTo = (id: number) => (from ? `/history/${id}?from=${from}` : `/history/${id}`);

  return (
    <>
      {loading && games.length === 0 && <p className="page-loader">{t('loading')}</p>}
      {!loading && games.length === 0 && <p className="friends-empty">{emptyText}</p>}
      {games.map((g) => {
        const b = badge(g);
        return (
          // Строка ведёт на повтор партии, а имя соперника — на его профиль.
          // Вложить ссылку в ссылку нельзя, поэтому строка — обычный div, а
          // переход к повтору делает растянутая на всю строку ссылка под
          // содержимым; ссылка на профиль лежит поверх неё.
          <div key={g.id} className="history-row">
            <Link className="history-open" to={replayTo(g.id)} aria-label={t('openGame')} />
            <span className={`history-badge ${b.cls}`}>
              {b.label}
              {g.isRanked && <DeltaTag delta={g.ratingDelta} />}
            </span>
            <Link className="friend-link history-player" to={`/players/${g.opponent.username}`}>
              <Avatar userId={g.opponent.id} name={g.opponent.displayName} size={36} />
              <span className="friend-name">
                {g.opponent.displayName}{' '}
                <span className="friend-username">@{g.opponent.username}</span>
                {g.opponent.rating !== undefined && <RatingBadge rating={g.opponent.rating} />}
              </span>
            </Link>
            <span className="history-meta">
              <span className={`game-kind-badge ${g.isRanked ? 'ranked' : 'casual'}`}>
                {g.isRanked ? t('ratedBadge') : t('casualBadge')}
              </span>
              <span>{tcLabel(g.timeControlId)}</span>
              <span className="history-date">{dateLabel(g.finishedAt)}</span>
            </span>
          </div>
        );
      })}
      {hasMore && (
        <button className="btn btn-subtle btn-block" onClick={onMore}>
          {t('historyMore')}
        </button>
      )}
    </>
  );
}
