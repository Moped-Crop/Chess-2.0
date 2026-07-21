import { useEffect, useState } from 'react';
import { apiGameHistory } from '../api/games';
import { useT } from '../i18n';
import { PageShell } from './PageShell';
import { GamesList, type GameRow } from '../components/GamesList';

/** История своих онлайн-партий. Разметка строк — общая с профилем игрока. */
export function GameHistoryPage() {
  const t = useT();
  const [games, setGames] = useState<GameRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiGameHistory(page);
        if (cancelled) return;
        // Своя история приходит с полем myColor — это и есть цвет игрока.
        const rows: GameRow[] = res.games.map(({ myColor, ...g }) => ({
          ...g,
          playerColor: myColor,
        }));
        setGames((prev) => (page === 1 ? rows : [...prev, ...rows]));
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

  return (
    <PageShell title={t('historyTitle')}>
      <div className="card friends-card">
        <GamesList
          games={games}
          loading={loading}
          hasMore={hasMore}
          onMore={() => setPage((p) => p + 1)}
          emptyText={t('historyEmpty')}
        />
      </div>
    </PageShell>
  );
}
