import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiPlayer, type PlayerCard } from '../api/players';
import { apiFriends, apiFriendRequest, apiFriendAccept, apiFriendDecline } from '../api/friends';
import { ApiError } from '../api/client';
import { useT, type StrKey } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from './MenuPage';
import { friendErrorKey } from './FriendsPage';
import { StatsGrid } from '../components/StatsGrid';

/** Отношение текущего пользователя к просматриваемому игроку. */
type Relation =
  | { kind: 'none' }
  | { kind: 'friends' }
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
      if (list.friends.some(byName)) {
        setRelation({ kind: 'friends' });
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
    relationBlock = <span className="relation-note">✓ {t('alreadyFriends')}</span>;
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
            <StatsGrid stats={card.stats} />
          </div>
        </>
      )}
    </PageShell>
  );
}
