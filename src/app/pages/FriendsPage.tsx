import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Swords, UserMinus, Users, UserPlus } from 'lucide-react';
import { useChatStore, badgeText } from '../store/chatStore';
import {
  apiFriends,
  apiFriendRequest,
  apiFriendAccept,
  apiFriendDecline,
  apiFriendRemove,
  type FriendEntry,
  type FriendsList,
} from '../api/friends';
import { ApiError } from '../api/client';
import { connectSocket } from '../net/socket';
import { useT, type StrKey } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from '../components/Avatar';
import { RatingBadge } from '../components/RatingBadge';
import { TimeControlPicker } from '../components/TimeControlPicker';
import {
  Card,
  Button,
  Field,
  SegmentedControl,
  EmptyState,
  Skeleton,
  type SegOption,
} from '../components/ui';

const REFRESH_MS = 12_000;

type Tab = 'friends' | 'requests';

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

/** Аватар с точкой присутствия + имя и рейтинг (под ником, отдельной строкой). */
function FriendIdentity({ entry }: { entry: FriendEntry }) {
  const t = useT();
  const { user, online } = entry;
  return (
    <Link className="frow-id" to={`/players/${user.username}`}>
      <span className="frow-avatar">
        <Avatar userId={user.id} name={user.displayName} size={40} />
        <span
          className={`presence-dot ${online ? 'on' : ''}`}
          title={online ? t('statusOnline') : t('statusOffline')}
        />
      </span>
      <span className="frow-text">
        <span className="frow-name">{user.displayName}</span>
        <RatingBadge rating={user.rating} />
      </span>
    </Link>
  );
}

/** Друзья и заявки — единственный социальный раздел (чат живёт здесь же). */
export function FriendsPage() {
  const t = useT();
  const conversations = useChatStore((s) => s.conversations);
  const [list, setList] = useState<FriendsList | null>(null);
  const [tab, setTab] = useState<Tab>('friends');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<StrKey | null>(null);
  const [notice, setNotice] = useState(false);
  const [invitedId, setInvitedId] = useState<number | null>(null);
  /** У кого открыт выбор контроля времени (шаг перед приглашением). */
  const [pickingId, setPickingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await apiFriends());
    } catch {
      /* временный сбой сети — оставляем прежний список */
    }
  }, []);

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

  function sendInvite(toUserId: number, timeControlId: string, ranked: boolean) {
    connectSocket().emit('friend-invite', { toUserId, timeControlId, ranked });
    setPickingId(null);
    setInvitedId(toUserId);
    window.setTimeout(() => setInvitedId(null), 5000);
  }

  const requestCount = list ? list.incoming.length : 0;
  const tabs: SegOption<Tab>[] = [
    { value: 'friends', label: t('menuFriends'), icon: Users },
    { value: 'requests', label: t('friendRequests'), icon: UserPlus, badge: requestCount },
  ];

  function unreadOf(friendshipId: number): number {
    return conversations.find((c) => c.friendshipId === friendshipId)?.unreadCount ?? 0;
  }

  return (
    <PageShell title={t('menuFriends')}>
      <SegmentedControl
        options={tabs}
        value={tab}
        onChange={setTab}
        block
        ariaLabel={t('menuFriends')}
        className="social-tabs"
      />

      {tab === 'friends' && (
        <Card className="social-card">
          {!list && (
            <div className="frow-list">
              {[0, 1, 2, 3].map((i) => (
                <div className="frow" key={i}>
                  <span className="frow-avatar">
                    <Skeleton w={40} h={40} circle />
                  </span>
                  <span className="frow-text">
                    <Skeleton w={130} h={15} />
                    <Skeleton w={90} h={13} />
                  </span>
                </div>
              ))}
            </div>
          )}
          {list && list.friends.length === 0 && (
            <EmptyState
              icon={Users}
              title={t('noFriendsYet')}
              action={
                <Button variant="primary" size="sm" icon={UserPlus} onClick={() => setTab('requests')}>
                  {t('addFriendAction')}
                </Button>
              }
            />
          )}
          {list && list.friends.length > 0 && (
            <div className="frow-list">
              {list.friends.map((f) => (
                <div className="frow-wrap" key={f.friendshipId}>
                  <div className="frow">
                    <FriendIdentity entry={f} />
                    <div className="frow-actions">
                      <span className="frow-action-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={MessageSquare}
                          to={`/chats/${f.friendshipId}`}
                          title={t('chatWriteMessage')}
                          aria-label={t('chatWriteMessage')}
                        />
                        {unreadOf(f.friendshipId) > 0 && (
                          <span className="unread-badge frow-action-badge">
                            {badgeText(unreadOf(f.friendshipId))}
                          </span>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Swords}
                        disabled={invitedId === f.user.id}
                        title={t('inviteToGame')}
                        aria-label={t('inviteToGame')}
                        onClick={() => setPickingId(pickingId === f.user.id ? null : f.user.id)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={UserMinus}
                        title={t('removeBtn')}
                        aria-label={t('removeBtn')}
                        onClick={() => void act(() => apiFriendRemove(f.friendshipId))}
                      />
                    </div>
                  </div>
                  {pickingId === f.user.id && (
                    <TimeControlPicker onPick={(id, ranked) => sendInvite(f.user.id, id, ranked)} />
                  )}
                </div>
              ))}
            </div>
          )}
          {error && tab === 'friends' && <p className="form-error">{t(error)}</p>}
        </Card>
      )}

      {tab === 'requests' && (
        <>
          <Card className="social-card">
            <form className="friend-add" onSubmit={(e) => void sendRequest(e)}>
              <Field
                className="friend-add-field"
                label={t('addFriendLabel')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
                required
              />
              <Button variant="primary" icon={UserPlus} type="submit">
                {t('addFriendBtn')}
              </Button>
            </form>
            {error && <p className="form-error">{t(error)}</p>}
            {notice && <p className="form-notice">{t('requestSent')}</p>}
          </Card>

          {list && list.incoming.length > 0 && (
            <Card className="social-card">
              <h3 className="section-title">{t('incomingTitle')}</h3>
              <div className="frow-list">
                {list.incoming.map((f) => (
                  <div className="frow" key={f.friendshipId}>
                    <FriendIdentity entry={f} />
                    <div className="frow-actions">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void act(() => apiFriendAccept(f.friendshipId))}
                      >
                        {t('acceptBtn')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void act(() => apiFriendDecline(f.friendshipId))}
                      >
                        {t('declineBtn')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {list && list.outgoing.length > 0 && (
            <Card className="social-card">
              <h3 className="section-title">{t('outgoingTitle')}</h3>
              <div className="frow-list">
                {list.outgoing.map((f) => (
                  <div className="frow" key={f.friendshipId}>
                    <FriendIdentity entry={f} />
                    <div className="frow-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void act(() => apiFriendRemove(f.friendshipId))}
                      >
                        {t('cancelRequestBtn')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {list && list.incoming.length === 0 && list.outgoing.length === 0 && (
            <Card className="social-card">
              <EmptyState icon={UserPlus} title={t('noFriendsYet')} />
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
