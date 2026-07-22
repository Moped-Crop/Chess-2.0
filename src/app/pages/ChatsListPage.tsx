import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useChatStore, badgeText } from '../store/chatStore';
import type { ChatMessage } from '../api/chat';
import { useT } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from './MenuPage';

/** Короткое превью последнего сообщения в строке беседы. */
function preview(message: ChatMessage | null, inviteText: string, emptyText: string): string {
  if (!message) return emptyText;
  return message.kind === 'invite' ? inviteText : message.body;
}

/**
 * Список бесед: аватар, имя, превью последнего сообщения, бейдж
 * непрочитанного и индикатор «в сети». Данные — из того же `chatStore`,
 * который держит актуальным `ChatLayer`; при заходе список просто обновляется.
 */
export function ChatsListPage() {
  const t = useT();
  const conversations = useChatStore((s) => s.conversations);
  const loaded = useChatStore((s) => s.loaded);
  const loadConversations = useChatStore((s) => s.loadConversations);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  return (
    <PageShell title={t('menuChats')}>
      <div className="card friends-card">
        {!loaded && conversations.length === 0 && <p className="page-loader">{t('loading')}</p>}
        {loaded && conversations.length === 0 && (
          <p className="friends-empty">{t('chatsEmpty')}</p>
        )}
        {conversations.map((c) => (
          <Link key={c.friendshipId} className="chat-row" to={`/chats/${c.friendshipId}`}>
            <span className="chat-row-avatar">
              <Avatar avatarBase64={c.friend.avatarBase64} name={c.friend.displayName} size={40} />
              {c.unreadCount > 0 && (
                <span className="unread-badge unread-badge-corner">
                  {badgeText(c.unreadCount)}
                </span>
              )}
            </span>
            <span className="chat-row-body">
              <span className="chat-row-top">
                <span className="friend-name">{c.friend.displayName}</span>
                <span
                  className={`online-dot ${c.online ? 'on' : ''}`}
                  title={c.online ? t('statusOnline') : t('statusOffline')}
                />
              </span>
              <span className="chat-row-preview">
                {preview(c.lastMessage, t('chatInvitePreview'), t('chatNoMessagesYet'))}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
