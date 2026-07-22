/**
 * Чтение переписки (REST). Живые события — в `server/sockets/chat.ts`.
 *
 * Все роуты требуют авторизации и участия в дружбе со статусом 'accepted':
 * ни с посторонним, ни по ещё не принятой заявке переписки не существует
 * (отвечаем 404 — как несуществующий тред, чтобы не раскрывать чужие id).
 */

import { Router } from 'express';
import type pg from 'pg';
import type { Env } from '../env';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { isOnline } from '../presence';
import {
  loadAcceptedFriendship,
  loadThreadPage,
  toMessageDto,
  MESSAGES_PAGE_SIZE,
  type MessageRow,
} from '../lib/chat';

interface ConversationRow {
  friendship_id: number;
  requester_id: number;
  requester_last_read: Date | string | null;
  addressee_last_read: Date | string | null;
  id: number;
  username: string;
  display_name: string;
  avatar_base64: string | null;
  rating: number | null;
}

export function chatRouter(pool: pg.Pool, env: Env): Router {
  const router = Router();
  const auth = requireAuth(pool, env.JWT_SECRET);

  /** Параметр :friendshipId — только положительное целое. */
  function parseId(raw: unknown): number | null {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  /**
   * Список бесед: принятые друзья, у каждого — превью последнего сообщения и
   * счётчик непрочитанного. Запросов фиксированное число (3–4), а не N+1 по
   * друзьям: последнее сообщение находится через MAX(id) с GROUP BY, счётчики
   * — одним запросом с группировкой.
   */
  router.get('/conversations', auth, async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const friendsRes = await pool.query(
        `SELECT f.id AS friendship_id, f.requester_id, f.requester_last_read, f.addressee_last_read,
                u.id, u.username, u.display_name, u.avatar_base64, s.rating
         FROM friendships f
         JOIN users u
           ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
         LEFT JOIN stats s ON s.user_id = u.id
         WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'`,
        [uid],
      );
      const rows = friendsRes.rows as ConversationRow[];
      const ids = rows.map((r) => r.friendship_id);

      const lastById = new Map<number, MessageRow>();
      const unreadById = new Map<number, number>();
      if (ids.length > 0) {
        const ph = ids.map((_, i) => `$${i + 1}`).join(', ');
        const lastIdsRes = await pool.query(
          `SELECT friendship_id, MAX(id) AS last_id FROM messages
           WHERE friendship_id IN (${ph}) GROUP BY friendship_id`,
          ids,
        );
        const lastIds = (lastIdsRes.rows as Array<{ last_id: number | string }>).map((r) =>
          Number(r.last_id),
        );
        if (lastIds.length > 0) {
          const ph2 = lastIds.map((_, i) => `$${i + 1}`).join(', ');
          const msgs = await pool.query(
            `SELECT id, friendship_id, sender_id, kind, body, invite_game_id,
                    invite_time_control_id, invite_ranked, invite_status, edited_at, created_at
             FROM messages WHERE id IN (${ph2})`,
            lastIds,
          );
          for (const m of msgs.rows as MessageRow[]) lastById.set(m.friendship_id, m);
        }

        // Непрочитанное: чужие сообщения свежее моей отметки прочтения. Какая
        // из двух колонок «моя» — зависит от стороны дружбы (CASE).
        const unreadRes = await pool.query(
          `SELECT m.friendship_id, COUNT(*) AS cnt
           FROM messages m
           JOIN friendships f ON f.id = m.friendship_id
           WHERE m.friendship_id IN (${ph})
             AND m.sender_id <> $${ids.length + 1}
             AND (
               CASE WHEN f.requester_id = $${ids.length + 1}
                    THEN f.requester_last_read ELSE f.addressee_last_read END IS NULL
               OR m.created_at > CASE WHEN f.requester_id = $${ids.length + 1}
                    THEN f.requester_last_read ELSE f.addressee_last_read END
             )
           GROUP BY m.friendship_id`,
          [...ids, uid],
        );
        for (const r of unreadRes.rows as Array<{ friendship_id: number; cnt: number | string }>) {
          unreadById.set(r.friendship_id, Number(r.cnt));
        }
      }

      const conversations = rows.map((r) => {
        const last = lastById.get(r.friendship_id);
        return {
          friendshipId: r.friendship_id,
          friend: {
            id: r.id,
            username: r.username,
            displayName: r.display_name,
            avatarBase64: r.avatar_base64,
            rating: r.rating ?? 1000,
          },
          online: isOnline(r.id),
          unreadCount: unreadById.get(r.friendship_id) ?? 0,
          lastMessage: last ? toMessageDto(last, []) : null,
        };
      });
      // Свежие беседы — сверху; ещё не начатые переписки уходят в конец.
      conversations.sort((a, b) => {
        const ta = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : -Infinity;
        const tb = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : -Infinity;
        if (ta === tb) return b.friendshipId - a.friendshipId;
        return tb - ta;
      });
      res.json({ conversations });
    } catch (e) {
      next(e);
    }
  });

  /** История треда, от новых к старым; `before` — курсор по id сообщения. */
  router.get('/:friendshipId/messages', auth, async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const friendshipId = parseId(req.params.friendshipId);
      if (friendshipId === null) {
        res.status(400).json({ error: 'validation' });
        return;
      }
      const friendship = await loadAcceptedFriendship(pool, friendshipId, uid);
      if (!friendship) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const beforeRaw = Number(req.query.before);
      const before = Number.isInteger(beforeRaw) && beforeRaw > 0 ? beforeRaw : null;
      const limitRaw = Number(req.query.limit);
      const limit =
        Number.isInteger(limitRaw) && limitRaw > 0
          ? Math.min(limitRaw, MESSAGES_PAGE_SIZE)
          : MESSAGES_PAGE_SIZE;
      const page = await loadThreadPage(pool, friendshipId, uid, before, limit);
      res.json(page);
    } catch (e) {
      next(e);
    }
  });

  /** Прочитано: обновляем СВОЮ колонку отметки на этой дружбе. */
  router.post('/:friendshipId/read', auth, async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const friendshipId = parseId(req.params.friendshipId);
      if (friendshipId === null) {
        res.status(400).json({ error: 'validation' });
        return;
      }
      const friendship = await loadAcceptedFriendship(pool, friendshipId, uid);
      if (!friendship) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const column =
        friendship.requester_id === uid ? 'requester_last_read' : 'addressee_last_read';
      await pool.query(`UPDATE friendships SET ${column} = NOW() WHERE id = $1`, [friendshipId]);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
