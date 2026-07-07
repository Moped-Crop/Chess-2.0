/**
 * Друзья: список (с онлайн-статусом), заявка по логину, принятие/отклонение,
 * удаление. Запрещены заявка самому себе и дубли в любую сторону.
 */

import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import type pg from 'pg';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Env } from '../env';
import { validate } from '../middleware/validate';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { isOnline } from '../presence';

const requestSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
});

const idSchema = z.object({ friendshipId: z.number().int().positive() });

interface FriendUserRow {
  friendship_id: number;
  status: string;
  requester_id: number;
  id: number;
  username: string;
  display_name: string;
  avatar_base64: string | null;
}

function publicUser(r: FriendUserRow) {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarBase64: r.avatar_base64,
  };
}

export function friendsRouter(pool: pg.Pool, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  const requestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  /** Список: принятые друзья + входящие и исходящие заявки. */
  router.get('/', auth, async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const rows = await pool.query(
        `SELECT f.id AS friendship_id, f.status, f.requester_id,
                u.id, u.username, u.display_name, u.avatar_base64
         FROM friendships f
         JOIN users u
           ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
         WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status <> 'declined'
         ORDER BY f.created_at DESC`,
        [uid],
      );
      const friends = [];
      const incoming = [];
      const outgoing = [];
      for (const r of rows.rows as FriendUserRow[]) {
        const entry = { friendshipId: r.friendship_id, user: publicUser(r), online: isOnline(r.id) };
        if (r.status === 'accepted') friends.push(entry);
        else if (r.requester_id === uid) outgoing.push(entry);
        else incoming.push(entry);
      }
      res.json({ friends, incoming, outgoing });
    } catch (e) {
      next(e);
    }
  });

  /** Заявка по логину. */
  router.post('/request', auth, requestLimiter, validate(requestSchema), async (req: AuthedRequest, res, next) => {
    try {
      const uid = req.userId!;
      const { username } = req.body as z.infer<typeof requestSchema>;

      const target = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if ((target.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }
      const targetId = target.rows[0].id as number;
      if (targetId === uid) {
        res.status(400).json({ error: 'self_request' });
        return;
      }

      const existing = await pool.query(
        `SELECT id, status FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
        [uid, targetId],
      );
      if ((existing.rowCount ?? 0) > 0) {
        const row = existing.rows[0];
        if (row.status !== 'declined') {
          res.status(409).json({ error: 'already_exists' });
          return;
        }
        // Отклонённую пару можно пригласить заново — старая запись заменяется.
        await pool.query('DELETE FROM friendships WHERE id = $1', [row.id]);
      }

      const inserted = await pool.query(
        `INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2) RETURNING id`,
        [uid, targetId],
      );
      res.status(201).json({ friendshipId: inserted.rows[0].id });
    } catch (e) {
      next(e);
    }
  });

  /** Принять/отклонить может только адресат pending-заявки. */
  async function setStatus(
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
    status: 'accepted' | 'declined',
  ) {
    try {
      const { friendshipId } = req.body as z.infer<typeof idSchema>;
      const r = await pool.query(
        `UPDATE friendships SET status = $1
         WHERE id = $2 AND addressee_id = $3 AND status = 'pending'
         RETURNING id`,
        [status, friendshipId, req.userId],
      );
      if ((r.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }

  router.post('/accept', auth, validate(idSchema), (req: AuthedRequest, res, next) =>
    setStatus(req, res, next, 'accepted'),
  );
  router.post('/decline', auth, validate(idSchema), (req: AuthedRequest, res, next) =>
    setStatus(req, res, next, 'declined'),
  );

  /** Удалить дружбу или отменить свою заявку. */
  router.delete('/:id', auth, async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'validation' });
        return;
      }
      const r = await pool.query(
        `DELETE FROM friendships
         WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)
         RETURNING id`,
        [id, req.userId],
      );
      if ((r.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
