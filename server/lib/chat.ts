/**
 * Общая часть чата: проверка доступа к треду, чтение сообщений и агрегация
 * реакций. Используется и REST-роутом (`server/routes/chat.ts`), и
 * сокет-слоем (`server/sockets/chat.ts`) — запросы не дублируются.
 *
 * Доступ к переписке есть ТОЛЬКО у участника дружбы со статусом 'accepted':
 * ни посторонний, ни отправитель ещё не принятой заявки в тред не попадают.
 */

import type pg from 'pg';

export type MessageKind = 'text' | 'invite';
export type InviteStatus = 'pending' | 'accepted' | 'declined';

export interface FriendshipRow {
  id: number;
  requester_id: number;
  addressee_id: number;
  status: string;
  requester_last_read: Date | string | null;
  addressee_last_read: Date | string | null;
}

export interface MessageRow {
  id: number;
  friendship_id: number;
  sender_id: number;
  kind: string;
  body: string;
  invite_game_id: number | null;
  invite_time_control_id: string | null;
  invite_ranked: boolean;
  invite_status: string;
  edited_at: Date | string | null;
  created_at: Date | string;
}

/** Реакция глазами конкретного зрителя. */
export interface ReactionAgg {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

/** Реакция без привязки к зрителю — рассылка обоим участникам из одной выборки. */
export interface RawReaction {
  emoji: string;
  userIds: number[];
}

export interface MessageDto {
  id: number;
  friendshipId: number;
  senderId: number;
  kind: MessageKind;
  body: string;
  inviteGameId: number | null;
  inviteTimeControlId: string | null;
  inviteRanked: boolean;
  inviteStatus: InviteStatus;
  editedAt: string | null;
  createdAt: string;
  reactions: ReactionAgg[];
}

export const MESSAGES_PAGE_SIZE = 30;

/** TIMESTAMP из pg приходит Date, из pg-mem — строкой; нормализуем в ISO. */
function toIso(v: Date | string | null): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * Дружба, если вызывающий — её участник И она принята. Иначе null (роут
 * отвечает 404, сокет-обработчик молча выходит).
 */
export async function loadAcceptedFriendship(
  pool: pg.Pool,
  friendshipId: number,
  userId: number,
): Promise<FriendshipRow | null> {
  const r = await pool.query(
    `SELECT id, requester_id, addressee_id, status, requester_last_read, addressee_last_read
     FROM friendships
     WHERE id = $1 AND status = 'accepted' AND (requester_id = $2 OR addressee_id = $2)`,
    [friendshipId, userId],
  );
  return (r.rows[0] as FriendshipRow | undefined) ?? null;
}

/** Второй участник дружбы. */
export function otherMember(f: FriendshipRow, userId: number): number {
  return f.requester_id === userId ? f.addressee_id : f.requester_id;
}

/** Отметка «последний раз читал» именно этого участника. */
export function lastReadOf(f: FriendshipRow, userId: number): Date | string | null {
  return f.requester_id === userId ? f.requester_last_read : f.addressee_last_read;
}

/** Список плейсхолдеров ($1,$2,…) — pg не раскрывает массив в IN сам. */
function placeholders(count: number, from = 1): string {
  return Array.from({ length: count }, (_, i) => `$${i + from}`).join(', ');
}

/**
 * Реакции пачкой по списку сообщений. Агрегация — в JS: страница треда мала
 * (≤ 30 сообщений), зато один простой запрос вместо оконных функций.
 */
export async function rawReactionsFor(
  pool: pg.Pool,
  messageIds: number[],
): Promise<Map<number, RawReaction[]>> {
  const out = new Map<number, RawReaction[]>();
  if (messageIds.length === 0) return out;
  const r = await pool.query(
    `SELECT message_id, user_id, emoji FROM message_reactions
     WHERE message_id IN (${placeholders(messageIds.length)})
     ORDER BY created_at`,
    messageIds,
  );
  for (const row of r.rows as Array<{ message_id: number; user_id: number; emoji: string }>) {
    let list = out.get(row.message_id);
    if (!list) {
      list = [];
      out.set(row.message_id, list);
    }
    const found = list.find((x) => x.emoji === row.emoji);
    if (found) found.userIds.push(row.user_id);
    else list.push({ emoji: row.emoji, userIds: [row.user_id] });
  }
  return out;
}

/** Реакции одного сообщения (после toggle рассылается весь список целиком). */
export async function rawReactionsOf(pool: pg.Pool, messageId: number): Promise<RawReaction[]> {
  return (await rawReactionsFor(pool, [messageId])).get(messageId) ?? [];
}

/** Взгляд конкретного зрителя на реакции: свои отмечены reactedByMe. */
export function aggregateFor(raw: RawReaction[], viewerId: number): ReactionAgg[] {
  return raw.map((r) => ({
    emoji: r.emoji,
    count: r.userIds.length,
    reactedByMe: r.userIds.includes(viewerId),
  }));
}

export function toMessageDto(row: MessageRow, reactions: ReactionAgg[]): MessageDto {
  return {
    id: row.id,
    friendshipId: row.friendship_id,
    senderId: row.sender_id,
    kind: row.kind as MessageKind,
    body: row.body,
    inviteGameId: row.invite_game_id,
    inviteTimeControlId: row.invite_time_control_id,
    inviteRanked: row.invite_ranked,
    inviteStatus: row.invite_status as InviteStatus,
    editedAt: toIso(row.edited_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    reactions,
  };
}

const MESSAGE_COLUMNS = `id, friendship_id, sender_id, kind, body, invite_game_id,
        invite_time_control_id, invite_ranked, invite_status, edited_at, created_at`;

/** Одно сообщение по id (без проверки доступа — её делает вызывающий). */
export async function loadMessageRow(pool: pg.Pool, messageId: number): Promise<MessageRow | null> {
  const r = await pool.query(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE id = $1`, [messageId]);
  return (r.rows[0] as MessageRow | undefined) ?? null;
}

/**
 * Отметить карточку приглашения принятой/отклонённой. Вызывается из хука в
 * обработчиках `invite-accepted`/`invite-declined`: решение могло быть принято
 * и не из чата (обычный тост), но карточка в переписке всё равно обязана
 * показать актуальный статус. null — приглашение было не из чата.
 */
export async function markChatInviteStatus(
  pool: pg.Pool,
  gameId: number,
  status: InviteStatus,
): Promise<{ messageId: number; friendshipId: number } | null> {
  const r = await pool.query(
    `SELECT id, friendship_id FROM messages WHERE invite_game_id = $1 AND kind = 'invite'`,
    [gameId],
  );
  const row = r.rows[0] as { id: number; friendship_id: number } | undefined;
  if (!row) return null;
  await pool.query('UPDATE messages SET invite_status = $1 WHERE id = $2', [status, row.id]);
  return { messageId: row.id, friendshipId: row.friendship_id };
}

/**
 * Страница треда, от новых к старым. `before` — id сообщения-курсора
 * (SERIAL монотонен, поэтому пагинация по id надёжнее, чем по времени).
 */
export async function loadThreadPage(
  pool: pg.Pool,
  friendshipId: number,
  viewerId: number,
  before: number | null,
  limit: number,
): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
  const params: unknown[] = [friendshipId];
  let where = 'friendship_id = $1';
  if (before !== null) {
    params.push(before);
    where += ` AND id < $${params.length}`;
  }
  params.push(limit + 1); // +1 строка — признак «есть ещё старее»
  const r = await pool.query(
    `SELECT ${MESSAGE_COLUMNS} FROM messages
     WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params,
  );
  const rows = r.rows as MessageRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const reactions = await rawReactionsFor(
    pool,
    page.map((m) => m.id),
  );
  return {
    messages: page.map((m) => toMessageDto(m, aggregateFor(reactions.get(m.id) ?? [], viewerId))),
    hasMore,
  };
}
