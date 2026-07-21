/**
 * Воркер бота: считает ход в отдельном потоке.
 *
 * Зачем не в главном потоке: сложный уровень думает пару секунд, и всё это
 * время вкладка не перерисовывалась бы — интерфейс выглядел бы зависшим.
 * Зачем не на сервере: партия с ботом целиком локальная, движок и так работает
 * на клиенте, никакой сетевой инфраструктуры для этого заводить не нужно.
 *
 * Движок (engine/) — чистый TypeScript без DOM и React, поэтому импортируется
 * сюда как есть.
 */

/// <reference lib="webworker" />

import type { BotRequest, BotResponse } from './protocol';
import { searchEasy, searchHard, searchMedium } from './search';

/**
 * Бюджеты времени на ход — подобраны замером именно на доске 10×8, а не взяты
 * из обычных шахмат.
 *  - средний: глубина 3 стабильно досчитывается за ~400 мс, а глубина 4 не
 *    успевает и за 900 мс. Больший бюджет не усилил бы игру ни на йоту —
 *    недосчитанная глубина отбрасывается, — только заставил бы ждать.
 *  - сложный: глубина 4 досчитывается за ~2 с, в эндшпиле успевает и 5-я.
 */
const MEDIUM_BUDGET_MS = 450;
const HARD_BUDGET_MS = 2500;

self.onmessage = (event: MessageEvent<BotRequest>): void => {
  const request = event.data;
  if (request.type !== 'think') return;

  const result =
    request.difficulty === 'easy'
      ? searchEasy(request.game)
      : request.difficulty === 'medium'
        ? searchMedium(request.game, MEDIUM_BUDGET_MS)
        : searchHard(request.game, HARD_BUDGET_MS);

  const response: BotResponse = {
    type: 'move',
    move: result.move,
    requestId: request.requestId,
    depth: result.depth,
    nodes: result.nodes,
    elapsedMs: result.elapsedMs,
  };
  self.postMessage(response);
};
