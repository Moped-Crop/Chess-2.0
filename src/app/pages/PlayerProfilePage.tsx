import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiPlayer, apiPlayerGames, type PlayerCard } from '../api/players';
import { apiFriends, apiFriendRequest, apiFriendAccept, apiFriendDecline } from '../api/friends';
import { ApiError } from '../api/client';
import { useT, type StrKey } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from './MenuPage';
import { friendErrorKey } from './FriendsPage';
import { StatsGrid } from '../components/StatsGrid';
import { RatingSummary, RankedStatsGrid } from '../components/RatingSummary';
import { GamesList, type GameRow } from '../components/GamesList';

/** Отношение текущего пользователя к просматриваемому игроку. */
type Relation =
  | { kind: 'none' }
  // friendshipId нужен для ссылки в переписку с этим другом.
  | { kind: 'friends'; friendshipId: number }
  | { kind: 'outgoing' }
  | { kind: 'incoming'; friendshipId: number };

/**
 * Read-only профиль другого игрока: аватар, имя, онлайн-статус, статистика и
 * блок отношения (добавить в друзья / заявка отправлена / входящая заявка /
 * уже друзья). Свой собственный профиль сюда не попадает — уводим на
 * редактируемый `/profile`.
 */
export function PlayerProfilePage() {
  const { username = '' } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const isSelf = me?.username === username;

  const [card, setCard] = useState<PlayerCard | null>(null);
  const [relation, setRelation] = useState<Relation | null>(null);
  const [error, setError] = useState<StrKey | null>(null);
  const [busy, setBusy] = useState(false);

  const [games, setGames] = useState<GameRow[]>([]);
  const [gamesPage, setGamesPage] = useState(1);
  const [gamesMore, setGamesMore] = useState(false);
  const [gamesLoading, setGamesLoading] = useState(true);

  // Свой ник — это редактируемый профиль, а не read-only копия себя самого.
  useEffect(() => {
    if (isSelf) navigate('/profile', { replace: true });
  }, [isSelf, navigate]);

  useEffect(() => {
    if (isSelf) return;
    let cancelled = false;
    setCard(null);
    setRelation(null);
    setError(null);
    setGames([]);
    setGamesPage(1);
    setGamesLoading(true);
    apiPlayer(username)
      .then((c) => {
        if (!cancelled) setCard(c);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError && e.status === 404 ? 'errUserNotFound' : 'errUnknown');
      });
    return () => {
      cancelled = true;
    };
  }, [username, isSelf]);

  /** Отношение выводим из общего списка друзей — отдельного эндпоинта нет. */
  const refreshRelation = useCallback(async () => {
    try {
      const list = await apiFriends();
      const byName = (e: { user: { username: string } }) => e.user.username === username;
      const friend = list.friends.find(byName);
      if (friend) {
        setRelation({ kind: 'friends', friendshipId: friend.friendshipId });
        return;
      }
      if (list.outgoing.some(byName)) {
        setRelation({ kind: 'outgoing' });
        return;
      }
      const incoming = list.incoming.find(byName);
      setRelation(
        incoming ? { kind: 'incoming', friendshipId: incoming.friendshipId } : { kind: 'none' },
      );
    } catch {
      /* временный сбой сети — блок отношения просто не появится */
    }
  }, [username]);

  useEffect(() => {
    if (isSelf || !card || card.deleted) return;
    void refreshRelation();
  }, [isSelf, card, refreshRelation]);

  // История партий игрока — грузится только у живого аккаунта.
  useEffect(() => {
    if (isSelf || !card || card.deleted) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiPlayerGames(username, gamesPage);
        if (cancelled) return;
        setGames((prev) => (gamesPage === 1 ? res.games : [...prev, ...res.games]));
        setGamesMore(res.hasMore);
      } catch {
        /* временный сбой сети — оставляем прежний список */
      } finally {
        if (!cancelled) setGamesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSelf, card, username, gamesPage]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refreshRelation();
    } catch (e) {
      setError(friendErrorKey(e));
    } finally {
      setBusy(false);
    }
  }

  // Редирект на свой профиль уже назначен — рендерить нечего.
  if (isSelf) return null;

  let relationBlock: ReactNode = null;
  if (relation?.kind === 'none') {
    relationBlock = (
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() => void act(() => apiFriendRequest(username))}
      >
        {t('addFriendAction')}
      </button>
    );
  } else if (relation?.kind === 'outgoing') {
    relationBlock = <span className="relation-note">{t('requestSent')}</span>;
  } else if (relation?.kind === 'friends') {
    relationBlock = (
      <>
        <span className="relation-note">✓ {t('alreadyFriends')}</span>
        <Link className="btn btn-primary" to={`/chats/${relation.friendshipId}`}>
          💬 {t('chatWriteMessage')}
        </Link>
      </>
    );
  } else if (relation?.kind === 'incoming') {
    const { friendshipId } = relation;
    relationBlock = (
      <>
        <span className="relation-note">{t('incomingFromPlayer')}</span>
        <div className="btn-row">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void act(() => apiFriendAccept(friendshipId))}
          >
            {t('acceptBtn')}
          </button>
          <button
            className="btn btn-subtle"
            disabled={busy}
            onClick={() => void act(() => apiFriendDecline(friendshipId))}
          >
            {t('declineBtn')}
          </button>
        </div>
      </>
    );
  }

  return (
    <PageShell title={t('playerProfileTitle')}>
      {!card && !error && <p className="page-loader">{t('loading')}</p>}
      {!card && error && (
        <div className="card profile-card">
          <p className="form-error">{t(error)}</p>
        </div>
      )}

      {card?.deleted && (
        <div className="card profile-card">
          <p className="player-deleted">{t('playerDeleted')}</p>
          <p className="profile-username">@{card.username}</p>
        </div>
      )}

      {card && !card.deleted && (
        <>
          <div className="card profile-card">
            <div className="profile-main">
              <Avatar avatarBase64={card.avatarBase64} name={card.displayName} size={88} />
              <div className="profile-fields">
                <h3 className="player-display-name">{card.displayName}</h3>
                <p className="profile-username">@{card.username}</p>
                <p className="player-presence">
                  <span className={`online-dot ${card.online ? 'on' : ''}`} />
                  {card.online ? t('statusOnline') : t('statusOffline')}
                </p>
              </div>
            </div>
            {error && <p className="form-error">{t(error)}</p>}
            {relationBlock && <div className="player-relation">{relationBlock}</div>}
          </div>

          <div className="card profile-card">
            <RatingSummary
              rating={card.rating}
              peakRating={card.peakRating}
              rankedGamesPlayed={card.ranked.gamesPlayed}
            />
          </div>

          <div className="card profile-card">
            <StatsGrid stats={card.stats} />
            <div style={{ marginTop: 16 }}>
              <RankedStatsGrid ranked={card.ranked} />
            </div>
          </div>

          <div className="card friends-card">
            <h3 className="section-title">{t('playerGamesTitle')}</h3>
            <GamesList
              games={games}
              loading={gamesLoading}
              hasMore={gamesMore}
              onMore={() => setGamesPage((p) => p + 1)}
              emptyText={t('playerNoGames')}
              from={card.username}
            />
          </div>
        </>
      )}
    </PageShell>
  );
}
