/**
 * Реалтайм переписки между друзьями: отправка, редактирование, реакции и
 * приглашение в партию прямо из чата.
 *
 * Подключение и аутентификация не дублируются — `io.use` из
 * `attachGameSockets` уже проверил JWT-cookie и положил userId в socket.data,
 * поэтому этот слой подключается вторым обработчиком `connection`.
 *
 * Доставка адресная: события летят по userId через реестр сокетов
 * (`presence.socketsOf`) — тем же механизмом, что и `friend-invite`, чтобы
 * сообщение доходило во все вкладки обоих участников независимо от того, на
 * какой странице они сейчас находятся.
 */

import type { Server, Socket } from 'socket.io';
import type pg from 'pg';
import { z } from 'zod';
import type { Env } from '../env';
import { PRESETS } from '../../src/app/clock/clock';
import { socketsOf } from '../presence';
import { createFriendGame } from '../lib/friendGame';
import {
  loadAcceptedFriendship,
  loadMessageRow,
  rawReactionsOf,
  aggregateFor,
  toMessageDto,
  otherMember,
} from '../lib/chat';

/* ---------- Схемы входящих событий ---------- */

const MAX_TEXT = 2000;
const text = z.string().trim().min(1).max(MAX_TEXT);
const friendshipId = z.number().int().positive();
const messageId = z.number().int().positive();

const sendSchema = z.object({ friendshipId, text });
const editSchema = z.object({ messageId, text });
// Эмодзи — короткая строка: составные символы (флаги, семьи) занимают
// несколько кодовых единиц, поэтому лимит с запасом, но в рамках VARCHAR(16).
const reactSchema = z.object({ messageId, emoji: z.string().min(1).max(16) });
const timeControlIds = PRESETS.map((p) => p.id) as [string, ...string[]];
const inviteSchema = z.object({ friendshipId, timeControlId: z.enum(timeControlIds) });

/* ---------- Антиспам: не больше 10 сообщений за 10 секунд ---------- */

const SPAM_WINDOW_MS = 10_000;
const SPAM_LIMIT = 10;

/**
 * Ограничитель отправки: не больше SPAM_LIMIT сообщений за окно с одного
 * пользователя. Состояние живёт в замыкании конкретного сервера (а не в
 * модуле), чтобы тесты с несколькими инстансами не влияли друг на друга.
 */
function makeSendLimiter(): (userId: number) => boolean {
  const recentSends = new Map<number, number[]>();
  return (userId) => {
    const now = Date.now();
    const fresh = (recentSends.get(userId) ?? []).filter((t) => now - t < SPAM_WINDOW_MS);
    recentSends.set(userId, fresh);
    if (fresh.length >= SPAM_LIMIT) return false;
    fresh.push(now);
    return true;
  };
}

/* ---------- Token bucket: частота любых чат-событий одного сокета ---------- */

const BUCKET_MAX = 30;
const REFILL_PER_SEC = 6;

interface Bucket {
  tokens: number;
  last: number;
}

function takeToken(bucket: Bucket): boolean {
  const now = Date.now();
  bucket.tokens = Math.min(BUCKET_MAX, bucket.tokens + ((now - bucket.last) / 1000) * REFILL_PER_SEC);
  bucket.last = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function attachChatSockets(io: Server, pool: pg.Pool, env: Env): void {
  const allowSend = makeSendLimiter();

  /** Одно событие обоим участникам дружбы, во все их вкладки. */
  function emitToBoth(userIds: number[], event: string, payloadFor: (uid: number) => unknown): void {
    for (const uid of userIds) {
      const payload = payloadFor(uid);
      for (const sid of socketsOf(uid)) io.to(sid).emit(event, payload);
    }
  }

  io.on('connection', (socket: Socket) => {
    const userId = (socket.data as { userId: number }).userId;
    const bucket: Bucket = { tokens: BUCKET_MAX, last: Date.now() };

    function on<T>(event: string, schema: z.ZodType<T>, handler: (input: T) => Promise<void>) {
      socket.on(event, (raw: unknown) => {
        if (!takeToken(bucket)) return; // flood: событие молча игнорируется
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return;
        handler(parsed.data).catch(() => {
          if (!env.isProd) console.error(`socket ${event}: handler error`);
        });
      });
    }

    /** Разослать сообщение обоим участникам треда. */
    async function broadcastMessage(msgId: number, members: number[]): Promise<void> {
      const row = await loadMessageRow(pool, msgId);
      if (!row) return;
      const raw = await rawReactionsOf(pool, msgId);
      emitToBoth(members, 'chat:message', (uid) => toMessageDto(row, aggregateFor(raw, uid)));
    }

    /* Новое текстовое сообщение. */
    on('chat:send', sendSchema, async ({ friendshipId: fid, text: body }) => {
      const friendship = await loadAcceptedFriendship(pool, fid, userId);
      if (!friendship) return; // не участник или дружба ещё не принята
      if (!allowSend(userId)) return; // антиспам
      const inserted = await pool.query(
        `INSERT INTO messages (friendship_id, sender_id, kind, body)
         VALUES ($1, $2, 'text', $3) RETURNING id`,
        [fid, userId, body],
      );
      await broadcastMessage(inserted.rows[0].id as number, [
        friendship.requester_id,
        friendship.addressee_id,
      ]);
    });

    /* Редактирование — только своего текстового сообщения. */
    on('chat:edit', editSchema, async ({ messageId: mid, text: body }) => {
      const row = await loadMessageRow(pool, mid);
      if (!row || row.sender_id !== userId || row.kind !== 'text') return;
      const friendship = await loadAcceptedFriendship(pool, row.friendship_id, userId);
      if (!friendship) return;
      const updated = await pool.query(
        `UPDATE messages SET body = $1, edited_at = NOW() WHERE id = $2 RETURNING edited_at`,
        [body, mid],
      );
      const editedAt = updated.rows[0].edited_at as Date | string;
      const payload = {
        messageId: mid,
        friendshipId: row.friendship_id,
        text: body,
        editedAt: editedAt instanceof Date ? editedAt.toISOString() : new Date(editedAt).toISOString(),
      };
      emitToBoth([friendship.requester_id, friendship.addressee_id], 'chat:message-edited', () => payload);
    });

    /* Реакция: повторный клик по своей же — снимает (toggle). */
    on('chat:react', reactSchema, async ({ messageId: mid, emoji }) => {
      const row = await loadMessageRow(pool, mid);
      if (!row) return;
      const friendship = await loadAcceptedFriendship(pool, row.friendship_id, userId);
      if (!friendship) return;
      const existing = await pool.query(
        'SELECT 1 FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
        [mid, userId, emoji],
      );
      if ((existing.rowCount ?? 0) > 0) {
        await pool.query(
          'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
          [mid, userId, emoji],
        );
      } else {
        await pool.query(
          'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
          [mid, userId, emoji],
        );
      }
      // Клиенту проще заменить весь список реакций, чем накатывать дифф.
      const raw = await rawReactionsOf(pool, mid);
      emitToBoth(
        [friendship.requester_id, friendship.addressee_id],
        'chat:reaction-updated',
        (uid) => ({
          messageId: mid,
          friendshipId: row.friendship_id,
          reactions: aggregateFor(raw, uid),
        }),
      );
    });

    /* Приглашение в партию прямо из чата. */
    on('chat:invite', inviteSchema, async ({ friendshipId: fid, timeControlId }) => {
      const friendship = await loadAcceptedFriendship(pool, fid, userId);
      if (!friendship) return;
      const toUserId = otherMember(friendship, userId);
      // Партия создаётся ровно той же функцией, что и обычный friend-invite.
      const { gameId } = await createFriendGame(pool, userId, toUserId, timeControlId);
      const inserted = await pool.query(
        `INSERT INTO messages (friendship_id, sender_id, kind, body, invite_game_id, invite_time_control_id)
         VALUES ($1, $2, 'invite', '', $3, $4) RETURNING id`,
        [fid, userId, gameId, timeControlId],
      );
      await broadcastMessage(inserted.rows[0].id as number, [
        friendship.requester_id,
        friendship.addressee_id,
      ]);

      // Плюс обычное приглашение: получатель увидит тост, даже если сейчас
      // не смотрит в чат (тот же самый gameId — принятие уже глобальное).
      const me = await pool.query('SELECT username, display_name FROM users WHERE id = $1', [
        userId,
      ]);
      socket.emit('invite-sent', { gameId });
      for (const sid of socketsOf(toUserId)) {
        io.to(sid).emit('friend-invite', {
          gameId,
          timeControlId,
          from: { username: me.rows[0].username, displayName: me.rows[0].display_name },
        });
      }
    });
  });
}
