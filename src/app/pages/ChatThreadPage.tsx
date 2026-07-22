import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import type { ChatMessage } from '../api/chat';
import { connectSocket } from '../net/socket';
import { presetById } from '../clock/clock';
import { useT, useLang, type StrKey } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from '../components/Avatar';
import { EmojiPicker } from '../components/EmojiPicker';
import { RatingBadge } from '../components/RatingBadge';
import { TimeControlPicker } from '../components/TimeControlPicker';

/** Куда уйдёт выбранный эмодзи: в текст сообщения или в реакцию. */
type EmojiTarget = { kind: 'composer' } | { kind: 'reaction'; messageId: number };

function timeLabel(iso: string, lang: string): string {
  return new Date(iso).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Переписка с одним другом. Пока страница открыта, тред считается активным:
 * новые сообщения в него сразу помечаются прочитанными и не показывают тост
 * (см. `chatStore.onMessage`).
 */
export function ChatThreadPage() {
  const { friendshipId: raw = '' } = useParams();
  const friendshipId = Number(raw);
  const t = useT();
  const lang = useLang();
  const myId = useAuthStore((s) => s.user?.id ?? null);

  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.friendshipId === friendshipId),
  );
  const thread = useChatStore((s) => s.threads[friendshipId]);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const openThread = useChatStore((s) => s.openThread);
  const loadMoreMessages = useChatStore((s) => s.loadMoreMessages);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const markRead = useChatStore((s) => s.markRead);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendInvite = useChatStore((s) => s.sendInvite);
  const editMessage = useChatStore((s) => s.editMessage);
  const toggleReaction = useChatStore((s) => s.toggleReaction);

  const [draft, setDraft] = useState('');
  const [emojiTarget, setEmojiTarget] = useState<EmojiTarget | null>(null);
  const [invitePicker, setInvitePicker] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastCountRef = useRef(0);

  const messages = thread?.messages ?? [];

  // Открыт тред — прочитано всё, что в нём было. При уходе активный тред
  // сбрасывается, иначе фоновые сообщения перестали бы считаться новыми.
  useEffect(() => {
    if (!Number.isInteger(friendshipId) || friendshipId <= 0) return;
    setActiveThread(friendshipId);
    void openThread(friendshipId);
    markRead(friendshipId);
    return () => setActiveThread(null);
  }, [friendshipId, setActiveThread, openThread, markRead]);

  // Шапка треда берёт собеседника из списка бесед — если зашли по прямой
  // ссылке и список ещё пуст, подгружаем его.
  useEffect(() => {
    if (!conversation) void loadConversations();
  }, [conversation, loadConversations]);

  // Новые сообщения — прокрутка вниз; подгрузка старых её не трогает.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (messages.length > lastCountRef.current && lastCountRef.current === 0) {
      el.scrollTop = el.scrollHeight;
    } else if (messages.length > lastCountRef.current) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (nearBottom) el.scrollTop = el.scrollHeight;
    }
    lastCountRef.current = messages.length;
  }, [messages.length]);

  /** Бесконечная лента вверх: у самого верха просим следующую страницу. */
  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || el.scrollTop > 40) return;
    void loadMoreMessages(friendshipId);
  }, [friendshipId, loadMoreMessages]);

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    sendMessage(friendshipId, text);
    setDraft('');
  }

  /** Эмодзи из пикера: в реакцию или в текст на позицию курсора. */
  function pickEmoji(emoji: string) {
    if (!emojiTarget) return;
    if (emojiTarget.kind === 'reaction') {
      toggleReaction(emojiTarget.messageId, emoji);
      setEmojiTarget(null);
      return;
    }
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    setEmojiTarget(null);
    // Курсор должен остаться сразу за вставленным символом.
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  }

  function inviteStatusKey(msg: ChatMessage): StrKey {
    if (msg.inviteStatus === 'accepted') return 'chatInviteAccepted';
    if (msg.inviteStatus === 'declined') return 'chatInviteDeclined';
    return 'chatInviteSent';
  }

  function renderInvite(msg: ChatMessage) {
    const preset = msg.inviteTimeControlId ? presetById(msg.inviteTimeControlId) : null;
    const canAnswer = msg.inviteStatus === 'pending' && msg.senderId !== myId;
    return (
      <div className="chat-invite-card">
        <span className="chat-invite-title">⚔ {t('chatInviteTitle')}</span>
        {msg.inviteRanked && (
          <span className="game-kind-badge ranked">{t('ratedBadge')}</span>
        )}
        {preset && (
          <span className="chat-invite-tc">{lang === 'en' ? preset.labelEn : preset.label}</span>
        )}
        {canAnswer ? (
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                connectSocket().emit('invite-accepted', { gameId: msg.inviteGameId })
              }
            >
              {t('acceptBtn')}
            </button>
            <button
              className="btn btn-subtle"
              onClick={() =>
                connectSocket().emit('invite-declined', { gameId: msg.inviteGameId })
              }
            >
              {t('declineBtn')}
            </button>
          </div>
        ) : (
          <span className="chat-invite-status">{t(inviteStatusKey(msg))}</span>
        )}
      </div>
    );
  }

  function renderMessage(msg: ChatMessage) {
    const mine = msg.senderId === myId;
    const editing = editingId === msg.id;
    return (
      <div key={msg.id} className={`chat-msg ${mine ? 'mine' : 'theirs'}`}>
        <div className="chat-bubble">
          {msg.kind === 'invite' ? (
            renderInvite(msg)
          ) : editing ? (
            <div className="chat-edit">
              <textarea
                className="input chat-edit-input"
                value={editDraft}
                autoFocus
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    editMessage(msg.id, editDraft);
                    setEditingId(null);
                  }
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    editMessage(msg.id, editDraft);
                    setEditingId(null);
                  }}
                >
                  {t('saveBtn')}
                </button>
                <button className="btn btn-ghost" onClick={() => setEditingId(null)}>
                  {t('cancel')}
                </button>
              </div>
            </div>
          ) : (
            <span className="chat-text">{msg.body}</span>
          )}
          <span className="chat-meta">
            {timeLabel(msg.createdAt, lang)}
            {msg.editedAt && <span className="chat-edited"> {t('chatEdited')}</span>}
          </span>
        </div>

        <div className="chat-msg-actions">
          <button
            className="chat-action"
            title={t('chatAddReaction')}
            onClick={() => setEmojiTarget({ kind: 'reaction', messageId: msg.id })}
          >
            ☺+
          </button>
          {mine && msg.kind === 'text' && !editing && (
            <button
              className="chat-action"
              title={t('chatEditAction')}
              onClick={() => {
                setEditingId(msg.id);
                setEditDraft(msg.body);
              }}
            >
              ✎
            </button>
          )}
        </div>

        {msg.reactions.length > 0 && (
          <div className="chat-reactions">
            {msg.reactions.map((r) => (
              <button
                key={r.emoji}
                className={`chat-reaction ${r.reactedByMe ? 'mine' : ''}`}
                onClick={() => toggleReaction(msg.id, r.emoji)}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const friend = conversation?.friend;

  return (
    <PageShell title={t('menuChats')}>
      <div className="card chat-card">
        <div className="chat-header">
          {friend ? (
            <Link className="friend-link" to={`/players/${friend.username}`}>
              <Avatar userId={friend.id} name={friend.displayName} size={36} />
              <span className="friend-name">
                {friend.displayName} <span className="friend-username">@{friend.username}</span>
                <RatingBadge rating={friend.rating} />
              </span>
            </Link>
          ) : (
            <span className="friend-name">{t('loading')}</span>
          )}
        </div>

        <div className="chat-list" ref={listRef} onScroll={onScroll}>
          {thread?.loading && <p className="chat-loading">{t('loading')}</p>}
          {thread && !thread.loading && messages.length === 0 && (
            <p className="friends-empty">{t('chatNoMessagesYet')}</p>
          )}
          {messages.map(renderMessage)}
        </div>

        {invitePicker && (
          <TimeControlPicker
            onPick={(id, ranked) => {
              sendInvite(friendshipId, id, ranked);
              setInvitePicker(false);
            }}
          />
        )}

        <div className="chat-composer">
          <button
            className="btn btn-ghost chat-composer-btn"
            title={t('chatEmojiBtn')}
            onClick={() => setEmojiTarget(emojiTarget?.kind === 'composer' ? null : { kind: 'composer' })}
          >
            ☺
          </button>
          <button
            className="btn btn-ghost chat-composer-btn"
            title={t('chatInviteBtn')}
            onClick={() => setInvitePicker((v) => !v)}
          >
            ⚔
          </button>
          <textarea
            className="input chat-input"
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder={t('chatPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitDraft();
              }
            }}
          />
          <button className="btn btn-primary" onClick={submitDraft} disabled={!draft.trim()}>
            {t('chatSend')}
          </button>
        </div>

        {emojiTarget && <EmojiPicker onPick={pickEmoji} onClose={() => setEmojiTarget(null)} />}
      </div>
    </PageShell>
  );
}
