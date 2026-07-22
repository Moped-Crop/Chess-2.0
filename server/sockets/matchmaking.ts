/**
 * Матчмейкинг рейтинговых партий: очередь ожидания в памяти сервера и подбор
 * глобально ближайшей по рейтингу пары.
 *
 * Очередь ЭФЕМЕРНАЯ — живёт только в памяти процесса (в базе ей делать нечего):
 * при рестарте сервера она теряется, клиент увидит переподключение сокета и
 * покажет «поиск прерван», а не бесконечный спиннер.
 *
 * Подключение и аутентификация не дублируются — `io.use` из
 * `attachGameSockets` уже проверил JWT-cookie и положил userId в socket.data,
 * поэтому этот слой подключается ещё одним обработчиком `connection`.
 */

import type { Server, Socket } from 'socket.io';
import type pg from 'pg';
import { z } from 'zod';
import type { Env } from '../env';
import { PRESETS } from '../../src/app/clock/clock';
import { socketsOf } from '../presence';
import { createFriendGame } from '../lib/friendGame';

/* ---------- Схема входящего события ---------- */

const timeControlIds = PRESETS.map((p) => p.id) as [string, ...string[]];
// Минимум один контроль времени; дубли схлопываем при обработке.
const joinSchema = z.object({
  timeControls: z.array(z.enum(timeControlIds)).min(1),
});

interface QueueEntry {
  userId: number;
  rating: number;
  timeControls: string[]; // выбранные пресеты
  joinedAt: number; // Date.now() постановки в очередь
  socketId: string; // сокет, который встал в очередь
}

/* ---------- Token bucket: частота mm-событий одного сокета ---------- */

const BUCKET_MAX = 12;
const REFILL_PER_SEC = 2;

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

export function attachMatchmakingSockets(io: Server, pool: pg.Pool, env: Env): void {
  // Ключ — userId: дедупликация даётся даром (вход со второй вкладки перезапишет
  // свою же прошлую запись, а не заведёт вторую).
  const queue = new Map<number, QueueEntry>();

  /** Разослать текущий размер очереди всем, кто в ней стоит. */
  function broadcastQueueSize(): void {
    const size = queue.size;
    for (const entry of queue.values()) {
      io.to(entry.socketId).emit('mm:queue-size', { size });
    }
  }

  function intersects(a: string[], b: string[]): boolean {
    return a.some((x) => b.includes(x));
  }

  /** Контроль времени пары — из пересечения, первый по порядку PRESETS (детерминированно). */
  function commonTimeControl(a: string[], b: string[]): string | null {
    for (const p of PRESETS) {
      if (a.includes(p.id) && b.includes(p.id)) return p.id;
    }
    return null;
  }

  /**
   * Свести глобально ближайшую по рейтингу пару. Порогов допуска НЕТ: если в
   * очереди двое — они и есть ближайшая пара, значит стартуют немедленно, каким
   * бы ни был разрыв (при маленьком онлайне неровная партия лучше, чем никакой).
   *
   * КРИТИЧЕСКАЯ СЕКЦИЯ (выбор пары + удаление их из очереди) — СИНХРОННА, без
   * единого await. Node однопоточен, поэтому пока не сделан первый await, никакой
   * другой обработчик не вклинится, и один игрок физически не попадёт в две
   * партии. await появляется только на вставке в БД — уже ПОСЛЕ удаления обоих.
   */
  async function tryMatch(): Promise<void> {
    for (;;) {
      const entries = [...queue.values()];
      let best: { a: QueueEntry; b: QueueEntry; diff: number; wait: number } | null = null;
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i];
          const b = entries[j];
          if (!intersects(a.timeControls, b.timeControls)) continue;
          const diff = Math.abs(a.rating - b.rating);
          // При равном разрыве предпочесть пару, которая суммарно ждёт дольше
          // (меньше сумма joinedAt = раньше зашли).
          const wait = a.joinedAt + b.joinedAt;
          if (best === null || diff < best.diff || (diff === best.diff && wait < best.wait)) {
            best = { a, b, diff, wait };
          }
        }
      }
      if (!best) return;

      const tc = commonTimeControl(best.a.timeControls, best.b.timeControls);
      if (!tc) return; // недостижимо (intersects это гарантировал), но пусть будет

      // СНАЧАЛА синхронно убрать обоих из очереди — тогда параллельный mm:join
      // или повторный tryMatch их уже не подхватит. Только ПОТОМ — await.
      queue.delete(best.a.userId);
      queue.delete(best.b.userId);

      let gameId: number;
      try {
        const created = await createFriendGame(pool, best.a.userId, best.b.userId, tc, {
          ranked: true,
          active: true,
        });
        gameId = created.gameId;
      } catch (e) {
        // Вставка упала — вернуть обоих в очередь и остановиться (не крутить
        // бесконечно на той же падающей паре); следующий mm:join попробует снова.
        queue.set(best.a.userId, best.a);
        queue.set(best.b.userId, best.b);
        if (!env.isProd) console.error('matchmaking: game creation failed', e);
        broadcastQueueSize();
        return;
      }

      // Клиент по mm:matched переходит на /play/online/:gameId.
      for (const uid of [best.a.userId, best.b.userId]) {
        for (const sid of socketsOf(uid)) io.to(sid).emit('mm:matched', { gameId });
      }
      broadcastQueueSize();
      // Продолжаем цикл — вдруг в очереди осталась ещё пара.
    }
  }

  io.on('connection', (socket: Socket) => {
    const userId = (socket.data as { userId: number }).userId;
    const bucket: Bucket = { tokens: BUCKET_MAX, last: Date.now() };

    socket.on('mm:join', (raw: unknown) => {
      if (!takeToken(bucket)) return;
      const parsed = joinSchema.safeParse(raw);
      if (!parsed.success) return;
      void (async () => {
        // Уже в активной партии? Тогда в очередь не ставим (нельзя оказаться в
        // двух партиях сразу).
        const active = await pool.query(
          `SELECT 1 FROM games WHERE (white_id = $1 OR black_id = $1) AND status = 'active' LIMIT 1`,
          [userId],
        );
        if ((active.rowCount ?? 0) > 0) {
          socket.emit('mm:error', { error: 'already_in_game' });
          return;
        }
        const s = await pool.query('SELECT rating FROM stats WHERE user_id = $1', [userId]);
        const rating = (s.rows[0]?.rating as number | undefined) ?? 1000;
        // Дедупликация контролей времени; перезапись прошлой своей записи.
        const timeControls = [...new Set(parsed.data.timeControls)];
        queue.set(userId, { userId, rating, timeControls, joinedAt: Date.now(), socketId: socket.id });
        socket.emit('mm:queued', { size: queue.size });
        broadcastQueueSize();
        await tryMatch();
      })().catch(() => {
        if (!env.isProd) console.error('socket mm:join: handler error');
      });
    });

    socket.on('mm:leave', () => {
      if (!takeToken(bucket)) return;
      if (queue.delete(userId)) {
        socket.emit('mm:left');
        broadcastQueueSize();
      }
    });

    socket.on('disconnect', () => {
      // Убираем из очереди, только если в ней стоял ИМЕННО этот сокет (иначе
      // отключение второй вкладки выдернуло бы игрока, ищущего в первой).
      const entry = queue.get(userId);
      if (entry && entry.socketId === socket.id) {
        queue.delete(userId);
        broadcastQueueSize();
      }
    });
  });
}
