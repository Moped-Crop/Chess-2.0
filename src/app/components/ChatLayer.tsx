import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useChatStore } from '../store/chatStore';
import { connectSocket } from '../net/socket';
import { checkSound } from '../sound';
import { useT } from '../i18n';
import { Avatar } from '../pages/MenuPage';
import type { ChatMessage, InviteStatus, Reaction } from '../api/chat';

interface MessageToast {
  friendshipId: number;
  name: string;
  avatarBase64: string | null;
  preview: string;
}

const TOAST_MS = 5000;

/**
 * Глобальный слой переписки: живёт рядом с `InviteLayer` и так же не зависит
 * от текущей страницы. Сразу после входа загружает список бесед (иначе бейджи
 * непрочитанного были бы пустыми до первого захода в чат) и раздаёт входящие
 * сокет-события в `chatStore`.
 *
 * Уведомление о новом сообщении — тем же тостом, что и приглашение в партию,
 * но НЕ показывается, если этот тред и так открыт на экране.
 */
export function ChatLayer() {
  const t = useT();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const [toast, setToast] = useState<MessageToast | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== 'authed') {
      useChatStore.getState().reset();
      return;
    }
    const s = connectSocket();
    const chat = useChatStore.getState();
    void chat.loadConversations();

    const onMessage = (msg: ChatMessage) => {
      const store = useChatStore.getState();
      const wasActive = store.activeThreadId === msg.friendshipId;
      const myId = useAuthStore.getState().user?.id ?? null;
      store.onMessage(msg);
      // Своё же эхо и открытый тред уведомления не заслуживают.
      if (msg.senderId === myId || wasActive) return;
      const conversation = useChatStore
        .getState()
        .conversations.find((c) => c.friendshipId === msg.friendshipId);
      // Новый тост заменяет предыдущий и перезапускает таймер — тосты не копятся.
      setToast({
        friendshipId: msg.friendshipId,
        name: conversation?.friend.displayName ?? '',
        avatarBase64: conversation?.friend.avatarBase64 ?? null,
        preview: msg.kind === 'invite' ? t('chatInvitePreview') : msg.body,
      });
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setToast(null), TOAST_MS);
      if (!useGameStore.getState().muted) checkSound();
    };
    const onEdited = (p: { messageId: number; text: string; editedAt: string }) =>
      useChatStore.getState().onMessageEdited(p);
    const onReaction = (p: { messageId: number; reactions: Reaction[] }) =>
      useChatStore.getState().onReactionUpdated(p);
    const onInviteStatus = (p: { messageId: number; status: InviteStatus }) =>
      useChatStore.getState().onInviteStatusUpdated(p);

    s.on('chat:message', onMessage);
    s.on('chat:message-edited', onEdited);
    s.on('chat:reaction-updated', onReaction);
    s.on('chat:invite-status-updated', onInviteStatus);
    return () => {
      s.off('chat:message', onMessage);
      s.off('chat:message-edited', onEdited);
      s.off('chat:reaction-updated', onReaction);
      s.off('chat:invite-status-updated', onInviteStatus);
    };
  }, [status, t]);

  // Таймер тоста снимается при уходе со страницы приложения целиком.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (status !== 'authed' || !toast) return null;

  return (
    <button
      className="invite-toast card chat-toast"
      onClick={() => {
        setToast(null);
        navigate(`/chats/${toast.friendshipId}`);
      }}
    >
      <Avatar avatarBase64={toast.avatarBase64} name={toast.name} size={36} />
      <span className="invite-text chat-toast-text">
        <b>{toast.name}</b>
        <span className="chat-toast-preview">{toast.preview}</span>
      </span>
    </button>
  );
}
