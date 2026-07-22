/**
 * Реалтайм чата (реальный Socket.IO на эфемерном порту + pg-mem): доставка
 * сообщений обоим участникам, редактирование, реакции-переключатели, антиспам,
 * запрет чужой/непринятой дружбы, приглашение в партию из чата и обновление
 * карточки приглашения при решении, принятом ВНЕ чата.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import type pg from 'pg';
import type { AddressInfo } from 'node:net';
import { createPool } from '../../server/db/pool';
import { runMigrations } from '../../server/db/migrate';
import { attachGameSockets } from '../../server/sockets/game';
import { attachChatSockets } from '../../server/sockets/chat';
import { TEST_ENV } from './testApp';

let pool: pg.Pool;
let httpServer: http.Server;
let ioServer: SocketIOServer;
let port: number;
const clients: ClientSocket[] = [];

interface ChatMessage {
  id: number;
  friendshipId: number;
  senderId: number;
  kind: 'text' | 'invite';
  body: string;
  inviteGameId: number | null;
  inviteTimeControlId: string | null;
  inviteStatus: 'pending' | 'accepted' | 'declined';
  editedAt: string | null;
  reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
}

async function makeUser(username: string): Promise<number> {
  const r = await pool.query(
    `INSERT INTO users (username, display_name, email, password_hash)
     VALUES ($1, $1, $2, 'hash') RETURNING id`,
    [username, `${username}@test.dev`],
  );
  const id = r.rows[0].id as number;
  await pool.query('INSERT INTO stats (user_id) VALUES ($1)', [id]);
  return id;
}

async function makeFriendship(a: number, b: number, status = 'accepted'): Promise<number> {
  const r = await pool.query(
    `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, $3) RETURNING id`,
    [a, b, status],
  );
  return r.rows[0].id as number;
}

function connectAs(userId: number): ClientSocket {
  const token = jwt.sign({ uid: userId, tv: 0 }, TEST_ENV.JWT_SECRET, { expiresIn: 3600 });
  const c = ioClient(`http://127.0.0.1:${port}`, {
    extraHeaders: { Cookie: `token=${token}` },
    reconnection: false,
  });
  clients.push(c);
  return c;
}

function waitFor<T>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

beforeEach(async () => {
  pool = await createPool('memory://');
  await runMigrations(pool);
  httpServer = http.createServer();
  ioServer = new SocketIOServer(httpServer, { serveClient: false });
  attachGameSockets(ioServer, pool, TEST_ENV);
  attachChatSockets(ioServer, pool, TEST_ENV);
  await new Promise<void>((r) => httpServer.listen(0, r));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await ioServer.close();
});

describe('chat:send', () => {
  it('delivers a message to both participants and stores it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const fid = await makeFriendship(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const atA = waitFor<ChatMessage>(a, 'chat:message');
    const atB = waitFor<ChatMessage>(b, 'chat:message');
    a.emit('chat:send', { friendshipId: fid, text: 'привет!' });

    expect((await atA).body).toBe('привет!');
    const received = await atB;
    expect(received.body).toBe('привет!');
    expect(received.senderId).toBe(alice);
    expect(received.kind).toBe('text');

    const rows = await pool.query('SELECT body FROM messages WHERE friendship_id = $1', [fid]);
    expect(rows.rowCount).toBe(1);
  });

  it('ignores messages to a pending friendship and to a stranger', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const pending = await makeFriendship(alice, bob, 'pending');
    const foreign = await makeFriendship(bob, carol);
    const a = connectAs(alice);
    await waitFor(a, 'connect');

    a.emit('chat:send', { friendshipId: pending, text: 'нельзя' });
    a.emit('chat:send', { friendshipId: foreign, text: 'тоже нельзя' });
    await new Promise((r) => setTimeout(r, 400));

    const rows = await pool.query('SELECT id FROM messages');
    expect(rows.rowCount).toBe(0);
  });

  it('rate limit stops a burst of messages', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const fid = await makeFriendship(alice, bob);
    const a = connectAs(alice);
    await waitFor(a, 'connect');

    for (let i = 0; i < 16; i++) a.emit('chat:send', { friendshipId: fid, text: `спам ${i}` });
    await new Promise((r) => setTimeout(r, 800));

    const rows = await pool.query('SELECT id FROM messages');
    expect(rows.rowCount).toBe(10);
  });
});

describe('chat:edit', () => {
  it('edits own text message and notifies both sides', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const fid = await makeFriendship(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const sent = waitFor<ChatMessage>(a, 'chat:message');
    a.emit('chat:send', { friendshipId: fid, text: 'опечятка' });
    const msg = await sent;

    const editedAtB = waitFor<{ messageId: number; text: string; editedAt: string }>(
      b,
      'chat:message-edited',
    );
    a.emit('chat:edit', { messageId: msg.id, text: 'опечатка' });
    const edited = await editedAtB;
    expect(edited.messageId).toBe(msg.id);
    expect(edited.text).toBe('опечатка');
    expect(edited.editedAt).toBeTruthy();
  });

  it('does not let the other side edit a foreign message', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const fid = await makeFriendship(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const sent = waitFor<ChatMessage>(a, 'chat:message');
    a.emit('chat:send', { friendshipId: fid, text: 'моё' });
    const msg = await sent;

    b.emit('chat:edit', { messageId: msg.id, text: 'подмена' });
    await new Promise((r) => setTimeout(r, 400));
    const row = await pool.query('SELECT body, edited_at FROM messages WHERE id = $1', [msg.id]);
    expect(row.rows[0].body).toBe('моё');
    expect(row.rows[0].edited_at).toBeNull();
  });
});

describe('chat:react', () => {
  it('adds and removes a reaction (toggle) and marks the viewer own reaction', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const fid = await makeFriendship(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const sent = waitFor<ChatMessage>(a, 'chat:message');
    a.emit('chat:send', { friendshipId: fid, text: 'оцени' });
    const msg = await sent;

    const atA = waitFor<{ reactions: ChatMessage['reactions'] }>(a, 'chat:reaction-updated');
    const atB = waitFor<{ reactions: ChatMessage['reactions'] }>(b, 'chat:reaction-updated');
    b.emit('chat:react', { messageId: msg.id, emoji: '👍' });
    // Для поставившего реакция «своя», для второго — чужая.
    expect((await atB).reactions).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
    expect((await atA).reactions).toEqual([{ emoji: '👍', count: 1, reactedByMe: false }]);

    // Разные эмодзи от одного человека уживаются вместе.
    const second = waitFor<{ reactions: ChatMessage['reactions'] }>(b, 'chat:reaction-updated');
    b.emit('chat:react', { messageId: msg.id, emoji: '❤️' });
    expect((await second).reactions).toHaveLength(2);

    // Повторный клик по своей же — снимает.
    const off = waitFor<{ reactions: ChatMessage['reactions'] }>(b, 'chat:reaction-updated');
    b.emit('chat:react', { messageId: msg.id, emoji: '👍' });
    expect((await off).reactions).toEqual([{ emoji: '❤️', count: 1, reactedByMe: true }]);
  });

  it('ignores reactions from a stranger', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const fid = await makeFriendship(alice, bob);
    const a = connectAs(alice);
    const c = connectAs(carol);
    await waitFor(a, 'connect');
    await waitFor(c, 'connect');

    const sent = waitFor<ChatMessage>(a, 'chat:message');
    a.emit('chat:send', { friendshipId: fid, text: 'не для всех' });
    const msg = await sent;

    c.emit('chat:react', { messageId: msg.id, emoji: '👍' });
    await new Promise((r) => setTimeout(r, 400));
    const rows = await pool.query('SELECT 1 FROM message_reactions WHERE message_id = $1', [msg.id]);
    expect(rows.rowCount).toBe(0);
  });
});

describe('chat:invite', () => {
  it('creates a real game, posts an invite card and sends the usual toast', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const fid = await makeFriendship(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const cardAtB = waitFor<ChatMessage>(b, 'chat:message');
    const toastAtB = waitFor<{ gameId: number; timeControlId: string }>(b, 'friend-invite');
    a.emit('chat:invite', { friendshipId: fid, timeControlId: '3+2' });

    const card = await cardAtB;
    const toast = await toastAtB;
    expect(card.kind).toBe('invite');
    expect(card.inviteStatus).toBe('pending');
    expect(card.inviteTimeControlId).toBe('3+2');
    expect(card.inviteGameId).toBe(toast.gameId);

    const game = await pool.query('SELECT status, time_control_id FROM games WHERE id = $1', [
      toast.gameId,
    ]);
    expect(game.rows[0]).toMatchObject({ status: 'waiting', time_control_id: '3+2' });
  });

  it('accepting from the ordinary toast updates the chat card for both sides', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const fid = await makeFriendship(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const cardAtB = waitFor<ChatMessage>(b, 'chat:message');
    a.emit('chat:invite', { friendshipId: fid, timeControlId: 'none' });
    const card = await cardAtB;

    const statusAtA = waitFor<{ messageId: number; status: string }>(a, 'chat:invite-status-updated');
    const statusAtB = waitFor<{ messageId: number; status: string }>(b, 'chat:invite-status-updated');
    // Принятие «как обычно» — тем же событием, что шлёт тост InviteLayer.
    b.emit('invite-accepted', { gameId: card.inviteGameId });

    expect(await statusAtA).toMatchObject({ messageId: card.id, status: 'accepted' });
    expect(await statusAtB).toMatchObject({ messageId: card.id, status: 'accepted' });
    const row = await pool.query('SELECT invite_status FROM messages WHERE id = $1', [card.id]);
    expect(row.rows[0].invite_status).toBe('accepted');
  });

  it('declining marks the card declined', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const fid = await makeFriendship(alice, bob);
    const a = connectAs(alice);
    const b = connectAs(bob);
    await waitFor(a, 'connect');
    await waitFor(b, 'connect');

    const cardAtB = waitFor<ChatMessage>(b, 'chat:message');
    a.emit('chat:invite', { friendshipId: fid, timeControlId: 'none' });
    const card = await cardAtB;

    const statusAtA = waitFor<{ status: string }>(a, 'chat:invite-status-updated');
    b.emit('invite-declined', { gameId: card.inviteGameId });
    expect((await statusAtA).status).toBe('declined');
  });

  it('does not create a game for a pending friendship', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const fid = await makeFriendship(alice, bob, 'pending');
    const a = connectAs(alice);
    await waitFor(a, 'connect');

    a.emit('chat:invite', { friendshipId: fid, timeControlId: 'none' });
    await new Promise((r) => setTimeout(r, 400));
    const games = await pool.query('SELECT id FROM games');
    expect(games.rowCount).toBe(0);
  });
});
