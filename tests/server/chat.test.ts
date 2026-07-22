/**
 * REST-часть чата (supertest + pg-mem): список бесед с превью и счётчиком
 * непрочитанного, пагинация треда, агрегация реакций, отметка прочтения и
 * запрет доступа к чужой/непринятой дружбе.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestApp, registerUser, type TestCtx, type TestUser } from './testApp';

let ctx: TestCtx;

beforeEach(async () => {
  ctx = await makeTestApp();
});

/** Дружба со статусом 'accepted' между двумя пользователями. */
async function befriend(a: TestUser, b: TestUser): Promise<number> {
  const req = await a.agent
    .post('/api/friends/request')
    .set('X-CSRF-Token', a.csrf)
    .send({ username: b.username });
  const friendshipId = req.body.friendshipId as number;
  await b.agent.post('/api/friends/accept').set('X-CSRF-Token', b.csrf).send({ friendshipId });
  return friendshipId;
}

/** Сообщение напрямую в БД — сокет-слой здесь не тестируется. */
async function insertMessage(
  friendshipId: number,
  senderId: number,
  body: string,
): Promise<number> {
  const r = await ctx.pool.query(
    `INSERT INTO messages (friendship_id, sender_id, kind, body) VALUES ($1, $2, 'text', $3) RETURNING id`,
    [friendshipId, senderId, body],
  );
  return r.rows[0].id as number;
}

describe('GET /api/chat/conversations', () => {
  it('returns accepted friends with last message preview and unread count', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const fid = await befriend(alice, bob);

    await insertMessage(fid, alice.id, 'привет');
    await insertMessage(fid, bob.id, 'здорово');
    await insertMessage(fid, bob.id, 'как дела?');

    const r = await alice.agent.get('/api/chat/conversations');
    expect(r.status).toBe(200);
    expect(r.body.conversations).toHaveLength(1);
    const c = r.body.conversations[0];
    expect(c.friendshipId).toBe(fid);
    expect(c.friend.username).toBe('bob');
    expect(c.lastMessage.body).toBe('как дела?');
    // Оба чужих сообщения не прочитаны, своё собственное — не считается.
    expect(c.unreadCount).toBe(2);
  });

  it('marking read zeroes the unread counter', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const fid = await befriend(alice, bob);
    await insertMessage(fid, bob.id, 'ау');

    const read = await alice.agent.post(`/api/chat/${fid}/read`).set('X-CSRF-Token', alice.csrf);
    expect(read.status).toBe(200);

    const r = await alice.agent.get('/api/chat/conversations');
    expect(r.body.conversations[0].unreadCount).toBe(0);

    // Собеседнику отметка чужого прочтения ничего не обнуляет.
    const forBob = await bob.agent.get('/api/chat/conversations');
    expect(forBob.body.conversations[0].unreadCount).toBe(0); // писал он сам
  });

  it('sorts fresh conversations first and shows empty threads without preview', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    await befriend(alice, bob);
    const withCarol = await befriend(alice, carol);
    await insertMessage(withCarol, carol.id, 'йо');

    const r = await alice.agent.get('/api/chat/conversations');
    expect(r.body.conversations).toHaveLength(2);
    expect(r.body.conversations[0].friend.username).toBe('carol');
    expect(r.body.conversations[1].lastMessage).toBeNull();
  });

  it('pending friendships are not conversations', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: bob.username });

    const r = await alice.agent.get('/api/chat/conversations');
    expect(r.body.conversations).toHaveLength(0);
  });
});

describe('GET /api/chat/:friendshipId/messages', () => {
  it('paginates from newest to oldest via the before cursor', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const fid = await befriend(alice, bob);
    const ids: number[] = [];
    for (let i = 1; i <= 5; i++) ids.push(await insertMessage(fid, alice.id, `msg ${i}`));

    const first = await alice.agent.get(`/api/chat/${fid}/messages?limit=2`);
    expect(first.status).toBe(200);
    expect(first.body.messages.map((m: { body: string }) => m.body)).toEqual(['msg 5', 'msg 4']);
    expect(first.body.hasMore).toBe(true);

    const second = await alice.agent.get(`/api/chat/${fid}/messages?limit=2&before=${ids[3]}`);
    expect(second.body.messages.map((m: { body: string }) => m.body)).toEqual(['msg 3', 'msg 2']);
    expect(second.body.hasMore).toBe(true);

    const third = await alice.agent.get(`/api/chat/${fid}/messages?limit=2&before=${ids[1]}`);
    expect(third.body.messages.map((m: { body: string }) => m.body)).toEqual(['msg 1']);
    expect(third.body.hasMore).toBe(false);
  });

  it('aggregates reactions per emoji and marks my own', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const fid = await befriend(alice, bob);
    const mid = await insertMessage(fid, alice.id, 'реагируй');
    for (const [user, emoji] of [
      [alice.id, '👍'],
      [bob.id, '👍'],
      [bob.id, '❤️'],
    ] as const) {
      await ctx.pool.query(
        'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
        [mid, user, emoji],
      );
    }

    const r = await alice.agent.get(`/api/chat/${fid}/messages`);
    const reactions = r.body.messages[0].reactions as Array<{
      emoji: string;
      count: number;
      reactedByMe: boolean;
    }>;
    expect(reactions).toEqual(
      expect.arrayContaining([
        { emoji: '👍', count: 2, reactedByMe: true },
        { emoji: '❤️', count: 1, reactedByMe: false },
      ]),
    );
  });

  it('rejects a stranger and a pending friendship with 404', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const carol = await registerUser(ctx, 'carol');
    const fid = await befriend(alice, bob);
    await insertMessage(fid, alice.id, 'секрет');

    const stranger = await carol.agent.get(`/api/chat/${fid}/messages`);
    expect(stranger.status).toBe(404);
    const strangerRead = await carol.agent
      .post(`/api/chat/${fid}/read`)
      .set('X-CSRF-Token', carol.csrf);
    expect(strangerRead.status).toBe(404);

    const pending = await alice.agent
      .post('/api/friends/request')
      .set('X-CSRF-Token', alice.csrf)
      .send({ username: carol.username });
    const pendingThread = await alice.agent.get(
      `/api/chat/${pending.body.friendshipId}/messages`,
    );
    expect(pendingThread.status).toBe(404);
  });

  it('requires authentication', async () => {
    const alice = await registerUser(ctx, 'alice');
    const bob = await registerUser(ctx, 'bob');
    const fid = await befriend(alice, bob);
    await alice.agent.post('/api/auth/logout').set('X-CSRF-Token', alice.csrf);
    const r = await alice.agent.get(`/api/chat/${fid}/messages`);
    expect(r.status).toBe(401);
  });
});
