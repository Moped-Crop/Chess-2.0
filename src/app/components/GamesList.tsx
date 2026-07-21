import { Link } from 'react-router-dom';
import type { Color, GameResult } from '../../engine/types';
import type { GamePlayer } from '../api/games';
import { presetById } from '../clock/clock';
import { useT, useLang } from '../i18n';
import { Avatar } from '../pages/MenuPage';

/** Строка списка — с точки зрения игрока, чью историю смотрим. */
export interface GameRow {
  id: number;
  opponent: GamePlayer;
  playerColor: Color;
  result: GameResult | null;
  timeControlId: string | null;
  finishedAt: string | null;
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
            <span className={`history-badge ${b.cls}`}>{b.label}</span>
            <Link className="friend-link history-player" to={`/players/${g.opponent.username}`}>
              <Avatar
                avatarBase64={g.opponent.avatarBase64}
                name={g.opponent.displayName}
                size={36}
              />
              <span className="friend-name">
                {g.opponent.displayName}{' '}
                <span className="friend-username">@{g.opponent.username}</span>
              </span>
            </Link>
            <span className="history-meta">
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
