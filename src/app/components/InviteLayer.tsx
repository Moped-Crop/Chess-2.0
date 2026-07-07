import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { connectSocket, disconnectSocket } from '../net/socket';
import { checkSound } from '../sound';
import { useT } from '../i18n';

interface Invite {
  gameId: number;
  from: { username: string; displayName: string };
}

/**
 * Глобальный слой приглашений: держит сокет-подключение после логина,
 * показывает тост «вас приглашают в партию» на любой странице и ведёт обоих
 * игроков в партию после принятия.
 */
export function InviteLayer() {
  const t = useT();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [declinedToast, setDeclinedToast] = useState(false);

  useEffect(() => {
    if (status !== 'authed') {
      disconnectSocket();
      return;
    }
    const s = connectSocket();

    const onInvite = (p: Invite) => {
      setInvite(p);
      if (!useGameStore.getState().muted) checkSound();
    };
    const onAccepted = (p: { gameId: number }) => {
      setInvite(null);
      navigate(`/play/online/${p.gameId}`);
    };
    const onDeclined = () => {
      setDeclinedToast(true);
      window.setTimeout(() => setDeclinedToast(false), 3000);
    };

    s.on('friend-invite', onInvite);
    s.on('invite-accepted', onAccepted);
    s.on('invite-declined', onDeclined);
    return () => {
      s.off('friend-invite', onInvite);
      s.off('invite-accepted', onAccepted);
      s.off('invite-declined', onDeclined);
    };
  }, [status, navigate]);

  if (status !== 'authed') return null;

  return (
    <>
      {invite && (
        <div className="invite-toast card">
          <span className="invite-text">
            <b>{invite.from.displayName}</b> {t('inviteIncoming')}
          </span>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={() => connectSocket().emit('invite-accepted', { gameId: invite.gameId })}
            >
              {t('acceptBtn')}
            </button>
            <button
              className="btn btn-subtle"
              onClick={() => {
                connectSocket().emit('invite-declined', { gameId: invite.gameId });
                setInvite(null);
              }}
            >
              {t('declineBtn')}
            </button>
          </div>
        </div>
      )}
      {declinedToast && (
        <div className="invite-toast card">
          <span className="invite-text">{t('inviteDeclinedNotice')}</span>
        </div>
      )}
    </>
  );
}
