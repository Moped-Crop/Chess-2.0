import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Smile, Swords, Send, SmilePlus, Pencil, MessageSquare } from 'lucide-react';
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
import { Card, Button, EmptyState, Skeleton } from '../components/ui';

/** Куда уйдёт выбранный эмодзи: в текст сообщения или в реакцию. */
type EmojiTarget = { kind: 'composer' } | { kind: 'reaction'; messageId: number };

const COMPOSER_MAX_H = 120; // ~5 строк

function timeLabel(iso: string, lang: string): string {
  return new Date(iso).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function autoresize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_H)}px`;
}

/**
 * Переписка с одним другом. Пока страница открыта, тред считается активным:
 * новые сообщения в него сразу помечаются прочитанными и не показывают тост.
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

  useEffect(() => {
    if (!Number.isInteger(friendshipId) || friendshipId <= 0) return;
    setActiveThread(friendshipId);
    void openThread(friendshipId);
    markRead(friendshipId);
    return () => setActiveThread(null);
  }, [friendshipId, setActiveThread, openThread, markRead]);

  useEffect(() => {
    if (!conversation) void loadConversations();
  }, [conversation, loadConversations]);

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
    autoresize(inputRef.current);
  }

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
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
      autoresize(el);
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
        <span className="chat-invite-icon" aria-hidden>
          <Swords size={20} strokeWidth={1.75} />
        </span>
        <div className="chat-invite-body">
          <div className="chat-invite-head">
            <span className="chat-invite-title">{t('chatInviteTitle')}</span>
            {msg.inviteRanked && <span className="ui-badge ui-badge-accent">{t('ratedBadge')}</span>}
          </div>
          {preset && (
            <span className="chat-invite-tc">{lang === 'en' ? preset.labelEn : preset.label}</span>
          )}
        </div>
        {canAnswer ? (
          <div className="chat-invite-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => connectSocket().emit('invite-accepted', { gameId: msg.inviteGameId })}
            >
              {t('acceptBtn')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => connectSocket().emit('invite-declined', { gameId: msg.inviteGameId })}
            >
              {t('declineBtn')}
            </Button>
          </div>
        ) : (
          <span className="chat-invite-status">{t(inviteStatusKey(msg))}</span>
        )}
      </div>
    );
  }

  const friend = conversation?.friend;

  function renderMessage(msg: ChatMessage, i: number) {
    if (msg.kind === 'invite') {
      return (
        <div key={msg.id} className="chat-invite-row">
          {renderInvite(msg)}
        </div>
      );
    }

    const mine = msg.senderId === myId;
    const editing = editingId === msg.id;
    const prev = messages[i - 1];
    // Группируем подряд идущие сообщения одного отправителя (не через инвайт).
    const grouped = !!prev && prev.kind === 'text' && prev.senderId === msg.senderId;

    return (
      <div
        key={msg.id}
        className={`chat-msg ${mine ? 'mine' : 'theirs'} ${grouped ? 'grouped' : 'first'}`}
      >
        {!mine &&
          (grouped ? (
            <span className="chat-msg-avatar-spacer" aria-hidden />
          ) : (
            <Avatar userId={friend?.id} name={friend?.displayName ?? '?'} size={28} />
          ))}

        <div className="chat-msg-main">
          <div className="chat-bubble">
            {editing ? (
              <div className="chat-edit">
                <textarea
                  className="ui-input ui-textarea chat-edit-input"
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
                <div className="chat-edit-actions">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    {t('cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      editMessage(msg.id, editDraft);
                      setEditingId(null);
                    }}
                  >
                    {t('saveBtn')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <span className="chat-text">{msg.body}</span>
                <span className="chat-meta">
                  {timeLabel(msg.createdAt, lang)}
                  {msg.editedAt && <span className="chat-edited"> {t('chatEdited')}</span>}
                </span>
              </>
            )}
          </div>

          {msg.reactions.length > 0 && (
            <div className="chat-reactions">
              {msg.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  className={`chat-reaction ${r.reactedByMe ? 'mine' : ''}`}
                  onClick={() => toggleReaction(msg.id, r.emoji)}
                >
                  {r.emoji} <span className="chat-reaction-count">{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!editing && (
          <div className="chat-msg-actions">
            <button
              type="button"
              className="chat-action"
              title={t('chatAddReaction')}
              aria-label={t('chatAddReaction')}
              onClick={() => setEmojiTarget({ kind: 'reaction', messageId: msg.id })}
            >
              <SmilePlus size={16} strokeWidth={1.75} aria-hidden />
            </button>
            {mine && msg.kind === 'text' && (
              <button
                type="button"
                className="chat-action"
                title={t('chatEditAction')}
                aria-label={t('chatEditAction')}
                onClick={() => {
                  setEditingId(msg.id);
                  setEditDraft(msg.body);
                }}
              >
                <Pencil size={16} strokeWidth={1.75} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <PageShell title={friend?.displayName ?? t('loading')}>
      <Card className="chat-card" flush>
        <div className="chat-header">
          {friend ? (
            <Link className="chat-header-link" to={`/players/${friend.username}`}>
              <span className="frow-avatar">
                <Avatar userId={friend.id} name={friend.displayName} size={40} />
                <span className={`presence-dot ${conversation?.online ? 'on' : ''}`} />
              </span>
              <span className="frow-text">
                <span className="frow-name">{friend.displayName}</span>
                <RatingBadge rating={friend.rating} />
              </span>
            </Link>
          ) : (
            <Skeleton w={180} h={20} />
          )}
        </div>

        <div className="chat-list" ref={listRef} onScroll={onScroll}>
          {thread?.loading && messages.length === 0 && (
            <div className="chat-skel">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} w={i % 2 ? '52%' : '38%'} h={38} radius="14px" className={i % 2 ? 'chat-skel-mine' : ''} />
              ))}
            </div>
          )}
          {thread && !thread.loading && messages.length === 0 && (
            <EmptyState icon={MessageSquare} title={t('chatNoMessagesYet')} />
          )}
          {messages.map((m, i) => renderMessage(m, i))}
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
          <textarea
            className="ui-input ui-textarea chat-input"
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder={t('chatPlaceholder')}
            onChange={(e) => {
              setDraft(e.target.value);
              autoresize(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitDraft();
              }
            }}
          />
          <div className="chat-composer-actions">
            <Button
              variant="ghost"
              size="sm"
              icon={Smile}
              title={t('chatEmojiBtn')}
              aria-label={t('chatEmojiBtn')}
              onClick={() =>
                setEmojiTarget(emojiTarget?.kind === 'composer' ? null : { kind: 'composer' })
              }
            />
            <Button
              variant="ghost"
              size="sm"
              icon={Swords}
              title={t('chatInviteBtn')}
              aria-label={t('chatInviteBtn')}
              onClick={() => setInvitePicker((v) => !v)}
            />
            <Button
              variant="primary"
              size="sm"
              icon={Send}
              title={t('chatSend')}
              aria-label={t('chatSend')}
              onClick={submitDraft}
              disabled={!draft.trim()}
            />
          </div>
        </div>

        {emojiTarget && <EmojiPicker onPick={pickEmoji} onClose={() => setEmojiTarget(null)} />}
      </Card>
    </PageShell>
  );
}
