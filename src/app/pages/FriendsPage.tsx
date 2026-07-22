import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useChatStore, badgeText } from '../store/chatStore';
import {
  apiFriends,
  apiFriendRequest,
  apiFriendAccept,
  apiFriendDecline,
  apiFriendRemove,
  type FriendsList,
  type PublicPlayer,
} from '../api/friends';
import { ApiError } from '../api/client';
import { connectSocket } from '../net/socket';
import { useT, type StrKey } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from '../components/Avatar';
import { RatingBadge } from '../components/RatingBadge';
import { TimeControlPicker } from '../components/TimeControlPicker';

const REFRESH_MS = 12_000;

/** Разбор ошибок дружбы; используется и на профиле другого игрока. */
export function friendErrorKey(e: unknown): StrKey {
  if (e instanceof ApiError) {
    if (e.code === 'user_not_found') return 'errUserNotFound';
    if (e.code === 'self_request') return 'errSelfRequest';
    if (e.code === 'already_exists') return 'errAlreadyFriends';
    if (e.status === 429) return 'errRateLimit';
    if (e.code === 'network') return 'errNetwork';
    if (e.code === 'validation') return 'errValidation';
  }
  return 'errUnknown';
}

/**
 * Аватар и имя строки — ссылка на профиль игрока. Кнопки действий лежат
 * отдельными соседями, а не внутри ссылки, поэтому клик по ним никогда не
 * открывает профиль (stopPropagation не нужен).
 *
 * `unread` — личный счётчик непрочитанных ИМЕННО от этого друга (не общая
 * сумма): маленький бейдж в углу аватара, как значки на иконках приложений.
 */
function FriendIdentity({ user, unread = 0 }: { user: PublicPlayer; unread?: number }) {
  return (
    <Link className="friend-link" to={`/players/${user.username}`}>
      <span className="friend-avatar-wrap">
        <Avatar userId={user.id} name={user.displayName} size={36} />
        {unread > 0 && (
          <span className="unread-badge unread-badge-corner">{badgeText(unread)}</span>
        )}
      </span>
      <span className="friend-name">
        {user.displayName} <span className="friend-username">@{user.username}</span>
        <RatingBadge rating={user.rating} />
      </span>
    </Link>
  );
}

/** Друзья: заявка по логину, входящие/исходящие, список со статусами. */
export function FriendsPage() {
  const t = useT();
  // Личные счётчики непрочитанного берутся из того же стора, что и бейджи
  // меню, — он уже в актуальном состоянии благодаря ChatLayer.
  const conversations = useChatStore((s) => s.conversations);
  const [list, setList] = useState<FriendsList | null>(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<StrKey | null>(null);
  const [notice, setNotice] = useState(false);
  const [invitedId, setInvitedId] = useState<number | null>(null);
  /** У кого сейчас открыт выбор контроля времени (шаг перед приглашением). */
  const [pickingId, setPickingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await apiFriends());
    } catch {
      /* временный сбой сети — оставляем прежний список */
    }
  }, []);

  // Загрузка + периодическое обновление статусов; таймер снимается при уходе.
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(false);
    try {
      await apiFriendRequest(username.trim());
      setUsername('');
      setNotice(true);
      window.setTimeout(() => setNotice(false), 2500);
      await refresh();
    } catch (err) {
      setError(friendErrorKey(err));
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(friendErrorKey(err));
    }
  }

  /** Второй шаг приглашения: контроль времени выбран — отправляем. */
  function sendInvite(toUserId: number, timeControlId: string, ranked: boolean) {
    connectSocket().emit('friend-invite', { toUserId, timeControlId, ranked });
    setPickingId(null);
    setInvitedId(toUserId);
    window.setTimeout(() => setInvitedId(null), 5000);
  }

  return (
    <PageShell title={t('menuFriends')}>
      <div className="card friends-card">
        <form className="friend-add" onSubmit={(e) => void sendRequest(e)}>
          <label className="field" style={{ flex: 1, marginBottom: 0 }}>
            <span className="field-label">{t('addFriendLabel')}</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]+"
              required
            />
          </label>
          <button className="btn btn-primary" type="submit">
            {t('addFriendBtn')}
          </button>
        </form>
        {error && <p className="form-error" style={{ marginTop: 12 }}>{t(error)}</p>}
        {notice && <p className="form-notice">{t('requestSent')}</p>}
      </div>

      {list && list.incoming.length > 0 && (
        <div className="card friends-card">
          <h3 className="section-title">{t('incomingTitle')}</h3>
          {list.incoming.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <FriendIdentity user={f.user} />
              <div className="btn-row friend-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void act(() => apiFriendAccept(f.friendshipId))}
                >
                  {t('acceptBtn')}
                </button>
                <button
                  className="btn btn-subtle"
                  onClick={() => void act(() => apiFriendDecline(f.friendshipId))}
                >
                  {t('declineBtn')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card friends-card">
        <h3 className="section-title">{t('menuFriends')}</h3>
        {list && list.friends.length === 0 && <p className="friends-empty">{t('noFriendsYet')}</p>}
        {!list && <p className="page-loader">{t('loading')}</p>}
        {list?.friends.map((f) => (
          <div key={f.friendshipId} className="friend-wrap">
            <div className="friend-row">
              <span className={`online-dot ${f.online ? 'on' : ''}`} title={f.online ? t('statusOnline') : t('statusOffline')} />
              <FriendIdentity
                user={f.user}
                unread={
                  conversations.find((c) => c.friendshipId === f.friendshipId)?.unreadCount ?? 0
                }
              />
              <div className="btn-row friend-actions">
                <Link
                  className="btn btn-subtle"
                  title={t('chatWriteMessage')}
                  to={`/chats/${f.friendshipId}`}
                >
                  💬
                </Link>
                <button
                  className="btn btn-subtle"
                  disabled={invitedId === f.user.id}
                  title={t('menuOnlineSub')}
                  onClick={() => setPickingId(pickingId === f.user.id ? null : f.user.id)}
                >
                  ⚔ {invitedId === f.user.id ? t('inviteSentNotice') : t('inviteToGame')}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => void act(() => apiFriendRemove(f.friendshipId))}
                >
                  {t('removeBtn')}
                </button>
              </div>
            </div>
            {pickingId === f.user.id && (
              <TimeControlPicker onPick={(id, ranked) => sendInvite(f.user.id, id, ranked)} />
            )}
          </div>
        ))}
      </div>

      {list && list.outgoing.length > 0 && (
        <div className="card friends-card">
          <h3 className="section-title">{t('outgoingTitle')}</h3>
          {list.outgoing.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <FriendIdentity user={f.user} />
              <div className="btn-row friend-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => void act(() => apiFriendRemove(f.friendshipId))}
                >
                  {t('cancelRequestBtn')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
