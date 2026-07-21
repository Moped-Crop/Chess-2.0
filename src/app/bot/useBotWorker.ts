/**
 * Обёртка над воркером бота: один воркер на страницу партии.
 *
 * Воркер создаётся при монтировании и обязательно завершается при уходе со
 * страницы — иначе после нескольких заходов в партию в фоне остались бы
 * висеть потоки, каждый со своей копией движка.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { GameState } from '../../engine/types';
import type { BotDifficulty, BotRequest, BotResponse } from './protocol';

export function useBotWorker(): (game: GameState, difficulty: BotDifficulty) => Promise<BotResponse> {
  const workerRef = useRef<Worker | null>(null);
  const nextIdRef = useRef(1);
  const pendingRef = useRef(new Map<number, (r: BotResponse) => void>());

  useEffect(() => {
    // Синтаксис Vite для воркера-модуля: URL считается на этапе сборки.
    const worker = new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module' });
    const pending = pendingRef.current;
    worker.onmessage = (event: MessageEvent<BotResponse>) => {
      const resolve = pending.get(event.data.requestId);
      if (resolve) {
        pending.delete(event.data.requestId);
        resolve(event.data);
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pending.clear();
    };
  }, []);

  return useCallback((game: GameState, difficulty: BotDifficulty): Promise<BotResponse> => {
    const worker = workerRef.current;
    // Воркер уже завершён (уход со страницы) — промис намеренно не резолвится:
    // применять ход всё равно уже некуда.
    if (!worker) return new Promise<BotResponse>(() => {});
    const requestId = nextIdRef.current++;
    const request: BotRequest = { type: 'think', game, difficulty, requestId };
    return new Promise<BotResponse>((resolve) => {
      pendingRef.current.set(requestId, resolve);
      worker.postMessage(request);
    });
  }, []);
}
