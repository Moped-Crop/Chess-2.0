import { useCallback, useEffect, useState } from 'react';
import {
  apiFriends,
  apiFriendRequest,
  apiFriendAccept,
  apiFriendDecline,
  apiFriendRemove,
  type FriendsList,
} from '../api/friends';
import { ApiError } from '../api/client';
import { useT, type StrKey } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from './MenuPage';

const REFRESH_MS = 12_000;

function friendErrorKey(e: unknown): StrKey {
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

/** Друзья: заявка по логину, входящие/исходящие, список со статусами. */
export function FriendsPage() {
  const t = useT();
  const [list, setList] = useState<FriendsList | null>(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<StrKey | null>(null);
  const [notice, setNotice] = useState(false);

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
              <Avatar avatarBase64={f.user.avatarBase64} name={f.user.displayName} size={36} />
              <span className="friend-name">
                {f.user.displayName} <span className="friend-username">@{f.user.username}</span>
              </span>
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
          <div key={f.friendshipId} className="friend-row">
            <span className={`online-dot ${f.online ? 'on' : ''}`} title={f.online ? t('statusOnline') : t('statusOffline')} />
            <Avatar avatarBase64={f.user.avatarBase64} name={f.user.displayName} size={36} />
            <span className="friend-name">
              {f.user.displayName} <span className="friend-username">@{f.user.username}</span>
            </span>
            <div className="btn-row friend-actions">
              <button className="btn btn-subtle" disabled title={t('menuOnlineSub')}>
                ⚔ {t('inviteToGame')}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => void act(() => apiFriendRemove(f.friendshipId))}
              >
                {t('removeBtn')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {list && list.outgoing.length > 0 && (
        <div className="card friends-card">
          <h3 className="section-title">{t('outgoingTitle')}</h3>
          {list.outgoing.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <Avatar avatarBase64={f.user.avatarBase64} name={f.user.displayName} size={36} />
              <span className="friend-name">
                {f.user.displayName} <span className="friend-username">@{f.user.username}</span>
              </span>
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
