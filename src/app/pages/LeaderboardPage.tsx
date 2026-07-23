import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiLeaderboard, type LeaderboardEntry, type LeaderboardMe } from '../api/leaderboard';
import { useAuthStore } from '../store/authStore';
import { useT, useLang, translate } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from '../components/Avatar';
import { RatingBadge } from '../components/RatingBadge';
import { Card, Button, Skeleton } from '../components/ui';

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

const MEDAL: Record<number, string> = { 1: 'gold', 2: 'silver', 3: 'bronze' };

/** Карточка одного из топ-3 — медальная рамка, без свечения. */
function PodiumCard({ entry, you }: { entry: LeaderboardEntry; you: boolean }) {
  return (
    <Link
      className={`lb-podium-card medal-${MEDAL[entry.place]} ${you ? 'lb-you-card' : ''}`}
      to={`/players/${entry.username}`}
    >
      <span className="lb-podium-place">{entry.place}</span>
      <Avatar userId={entry.userId} name={entry.displayName} size={56} />
      <span className="lb-podium-name">{entry.displayName}</span>
      <span className="lb-podium-rating">{entry.rating}</span>
    </Link>
  );
}

/** Строка таблицы (места с 4-го). */
function TableRow({ entry, you }: { entry: LeaderboardEntry; you: boolean }) {
  return (
    <tr className={you ? 'lb-you-row' : ''}>
      <td className="lb-place num">{entry.place}</td>
      <td>
        <Link className="lb-tname" to={`/players/${entry.username}`}>
          <Avatar userId={entry.userId} name={entry.displayName} size={28} />
          <span className="lb-tname-text">{entry.displayName}</span>
        </Link>
      </td>
      <td className="num lb-trating">{entry.rating}</td>
      <td className="num">{entry.ranked.gamesPlayed}</td>
      <td className="num">{wld(entry.ranked)}</td>
    </tr>
  );
}

/** Лидерборд: топ-3 карточками, остальные таблицей, своя строка закреплена. */
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

  const isYou = (e: LeaderboardEntry) => !!user && e.username === user.username;
  const meOnPage = !!user && entries.some(isYou);
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  let meBlock: React.ReactNode = null;
  if (me && user) {
    if (!me.eligible) {
      const n = me.gamesToQualify;
      const games =
        lang === 'en'
          ? `${n} more ranked game${n === 1 ? '' : 's'}`
          : `${n} ${ruPlural(n, 'рейтинговую партию', 'рейтинговые партии', 'рейтинговых партий')}`;
      meBlock = (
        <Card className="lb-qualify-card">
          <p className="lb-qualify">
            {translate(lang, 'leaderboardQualify').replace('{games}', games)}
          </p>
        </Card>
      );
    } else if (!meOnPage && me.place !== null) {
      meBlock = (
        <div className="lb-you-pinned">
          <span className="lb-you-label">{t('leaderboardYou')}</span>
          <span className="lb-place num">{me.place}</span>
          <span className="lb-you-name">{user.displayName}</span>
          <RatingBadge rating={me.rating} />
        </div>
      );
    }
  }

  const showSkeleton = loading && entries.length === 0;

  return (
    <PageShell title={t('leaderboardTitle')}>
      {showSkeleton && (
        <Card className="lb-card">
          <div className="lb-skel">
            {Array.from({ length: 10 }, (_, i) => (
              <div className="lb-skel-row" key={i}>
                <Skeleton w={24} h={16} />
                <Skeleton w={28} h={28} circle />
                <Skeleton w="40%" h={15} />
                <Skeleton w={48} h={15} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {!showSkeleton && entries.length === 0 && (
        <Card className="lb-card">
          <p className="friends-empty">{t('leaderboardEmpty')}</p>
        </Card>
      )}

      {podium.length > 0 && (
        <div className="lb-podium">
          {podium.map((e) => (
            <PodiumCard key={e.username} entry={e} you={isYou(e)} />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <Card className="lb-card">
          <div className="lb-table-wrap">
            <table className="lb-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>{t('lbColPlayer')}</th>
                  <th className="num">{t('ratingLabel')}</th>
                  <th className="num">{t('lbColGames')}</th>
                  <th className="num">{t('lbColRecord')}</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((e) => (
                  <TableRow key={e.username} entry={e} you={isYou(e)} />
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <Button variant="secondary" block onClick={() => setPage((p) => p + 1)} className="lb-more">
              {t('historyMore')}
            </Button>
          )}
        </Card>
      )}

      {meBlock}
    </PageShell>
  );
}
