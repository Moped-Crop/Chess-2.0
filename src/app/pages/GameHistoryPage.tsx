import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGameHistory, type HistoryEntry } from '../api/games';
import { presetById } from '../clock/clock';
import { useT, useLang } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from './MenuPage';

/** История онлайн-партий: бейдж результата, соперник, контроль, дата. */
export function GameHistoryPage() {
  const t = useT();
  const lang = useLang();
  const [games, setGames] = useState<HistoryEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiGameHistory(page);
        if (cancelled) return;
        setGames((prev) => (page === 1 ? res.games : [...prev, ...res.games]));
        setHasMore(res.hasMore);
      } catch {
        /* временный сбой сети — оставляем прежний список */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  function badge(g: HistoryEntry): { cls: string; label: string } {
    if (g.result === 'draw') return { cls: 'draw', label: t('historyDraw') };
    if (g.result === g.myColor) return { cls: 'win', label: t('historyWin') };
    return { cls: 'loss', label: t('historyLoss') };
  }

  function tcLabel(id: string | null): string {
    if (!id) return '—';
    const p = presetById(id);
    return lang === 'en' ? p.labelEn : p.label;
  }

  function dateLabel(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <PageShell title={t('historyTitle')}>
      <div className="card friends-card">
        {loading && games.length === 0 && <p className="page-loader">{t('loading')}</p>}
        {!loading && games.length === 0 && <p className="friends-empty">{t('historyEmpty')}</p>}
        {games.map((g) => {
          const b = badge(g);
          return (
            // Строка ведёт на повтор партии, а имя соперника — на его профиль.
            // Вложить ссылку в ссылку нельзя, поэтому строка — обычный div, а
            // переход к повтору делает растянутая на всю строку ссылка под
            // содержимым; ссылка на профиль лежит поверх неё.
            <div key={g.id} className="history-row">
              <Link className="history-open" to={`/history/${g.id}`} aria-label={t('openGame')} />
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
          <button className="btn btn-subtle btn-block" onClick={() => setPage((p) => p + 1)}>
            {t('historyMore')}
          </button>
        )}
      </div>
    </PageShell>
  );
}
