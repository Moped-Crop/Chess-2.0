import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiLeaderboard, type LeaderboardEntry, type LeaderboardMe } from '../api/leaderboard';
import { useAuthStore } from '../store/authStore';
import { useT, useLang, translate } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from './MenuPage';
import { RatingBadge } from '../components/RatingBadge';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** Русская форма множественного числа (1 партию / 2 партии / 5 партий). */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function wld(r: { wins: number; losses: number; draws: number }): string {
  return `${r.wins}–${r.losses}–${r.draws}`;
}

function Row({ entry, you }: { entry: LeaderboardEntry; you?: boolean }) {
  const t = useT();
  const topCls = entry.place <= 3 ? `top${entry.place}` : '';
  return (
    <Link className={`lb-row ${topCls} ${you ? 'lb-you' : ''}`} to={`/players/${entry.username}`}>
      {entry.place <= 3 ? (
        <span className="lb-medal" aria-hidden>
          {MEDALS[entry.place]}
        </span>
      ) : (
        <span className="lb-place">{entry.place}</span>
      )}
      <span className="lb-identity">
        <Avatar avatarBase64={entry.avatarBase64} name={entry.displayName} size={36} />
        <span className="lb-name">
          <span className="lb-name-main">
            {you && <span className="lb-you-label">{t('leaderboardYou')} · </span>}
            {entry.displayName}
          </span>
          <span className="lb-wld">{wld(entry.ranked)}</span>
        </span>
      </span>
      <RatingBadge rating={entry.rating} />
    </Link>
  );
}

/** Лидерборд: топ по рейтингу, выделенные топ-3 и закреплённая своя позиция. */
export function LeaderboardPage() {
  const t = useT();
  const lang = useLang();
  const user = useAuthStore((s) => s.user);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [me, setMe] = useState<LeaderboardMe | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiLeaderboard(page);
        if (cancelled) return;
        setEntries((prev) => (page === 1 ? res.entries : [...prev, ...res.entries]));
        setHasMore(res.hasMore);
        setMe(res.me);
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

  // Своя строка нужна, только если игрок не попал на текущую страницу списка.
  const meOnPage = !!user && entries.some((e) => e.username === user.username);

  let meBlock: React.ReactNode = null;
  if (me && user) {
    if (!me.eligible) {
      const n = me.gamesToQualify;
      const games =
        lang === 'en'
          ? `${n} more ranked game${n === 1 ? '' : 's'}`
          : `${n} ${ruPlural(n, 'рейтинговую партию', 'рейтинговые партии', 'рейтинговых партий')}`;
      meBlock = (
        <div className="card friends-card lb-you">
          <p className="lb-qualify">
            {translate(lang, 'leaderboardQualify').replace('{games}', games)}
          </p>
        </div>
      );
    } else if (!meOnPage && me.place !== null) {
      meBlock = (
        <div className="card friends-card" style={{ padding: 0 }}>
          <Row
            you
            entry={{
              place: me.place,
              username: user.username,
              displayName: user.displayName,
              avatarBase64: user.avatarBase64,
              rating: me.rating,
              // W/L/D своей строки в этом эндпоинте не гоняем — показываем счёт из
              // числа партий; детально видно в профиле.
              ranked: { gamesPlayed: me.rankedGamesPlayed, wins: 0, losses: 0, draws: 0 },
            }}
          />
        </div>
      );
    }
  }

  return (
    <PageShell title={t('leaderboardTitle')}>
      <div className="card friends-card">
        {loading && entries.length === 0 && <p className="page-loader">{t('loading')}</p>}
        {!loading && entries.length === 0 && (
          <p className="friends-empty">{t('leaderboardEmpty')}</p>
        )}
        {entries.map((e) => (
          <Row key={e.username} entry={e} you={!!user && e.username === user.username} />
        ))}
        {hasMore && (
          <button className="btn btn-subtle btn-block" onClick={() => setPage((p) => p + 1)}>
            {t('historyMore')}
          </button>
        )}
      </div>
      {meBlock}
    </PageShell>
  );
}
