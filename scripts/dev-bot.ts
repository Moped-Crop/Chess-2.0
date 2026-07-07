/**
 * Временный dev-бот для ручной проверки онлайн-режима: входит как bob_friend,
 * принимает приглашение, играет случайные легальные ходы; по аргументу
 * --resign-after=N сдаётся после N своих ходов.
 *
 * Запуск: npx tsx scripts/dev-bot.ts   (сервер должен работать на :3001)
 * Утилита разработчика — удаляется перед публикацией репозитория.
 */

import { io } from 'socket.io-client';
import { createInitialState, applyMove, computeResult, legalMoves } from '../src/engine';
import type { GameState, Move, Color } from '../src/engine/types';

const BASE = 'http://localhost:3001';
const resignAfter = Number(
  process.argv.find((a) => a.startsWith('--resign-after='))?.split('=')[1] ?? Infinity,
);

function reconstruct(moves: Move[]): GameState {
  let s = createInitialState();
  for (const m of moves) {
    const a = applyMove(s, m);
    s = { ...a, result: computeResult(a) };
  }
  return s;
}

async function main() {
  // Логин с ручным сбором cookie (node fetch не хранит их сам).
  const csrfRes = await fetch(`${BASE}/api/csrf`);
  const csrf = ((await csrfRes.json()) as { csrfToken: string }).csrfToken;
  const csrfCookie = csrfRes.headers.get('set-cookie')?.split(';')[0] ?? '';

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
      Cookie: csrfCookie,
    },
    body: JSON.stringify({ login: 'bob_friend', password: 'password-123' }),
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
  const tokenCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';
  console.log('[bot] вошёл как bob_friend');

  const socket = io(BASE, { extraHeaders: { Cookie: `${tokenCookie}; ${csrfCookie}` } });

  let gameId = 0;
  let myColor: Color | null = null;
  let moves: Move[] = [];
  let myMoves = 0;

  function maybeMove() {
    if (!myColor) return;
    const state = reconstruct(moves);
    if (state.result !== 'ongoing' || state.turn !== myColor) return;
    if (myMoves >= resignAfter) {
      console.log('[bot] сдаюсь');
      socket.emit('resign', { gameId });
      return;
    }
    const all = legalMoves(state);
    const move = all[Math.floor(Math.random() * all.length)];
    const index = moves.length;
    moves.push(move);
    myMoves++;
    setTimeout(() => socket.emit('move', { gameId, move, index }), 400);
    console.log(`[bot] ход #${index}: ${move.from}→${move.to}`);
  }

  socket.on('connect', () => console.log('[bot] socket подключён'));
  socket.on('connect_error', (e) => console.error('[bot] connect_error:', e.message));

  socket.on('friend-invite', (p: { gameId: number; from: { username: string } }) => {
    console.log(`[bot] приглашение от ${p.from.username}, принимаю (игра ${p.gameId})`);
    socket.emit('invite-accepted', { gameId: p.gameId });
  });

  socket.on('invite-accepted', (p: { gameId: number }) => {
    gameId = p.gameId;
    socket.emit('join-game', { gameId });
  });

  socket.on(
    'game-state',
    (p: { gameId: number; myColor: Color; moves: Move[]; status: string }) => {
      gameId = p.gameId;
      myColor = p.myColor;
      moves = p.moves.slice();
      console.log(`[bot] в игре ${gameId} за ${myColor}, ходов: ${moves.length}, статус ${p.status}`);
      maybeMove();
    },
  );

  socket.on('move', (p: { gameId: number; move: Move }) => {
    if (p.gameId !== gameId) return;
    moves.push(p.move);
    maybeMove();
  });

  socket.on('move-rejected', () => {
    console.log('[bot] ход отклонён — ресинк');
    socket.emit('join-game', { gameId });
  });

  socket.on('game-over', (p: { result: string; reason: string }) => {
    console.log(`[bot] партия окончена: ${p.result} (${p.reason})`);
    setTimeout(() => process.exit(0), 500);
  });
}

main().catch((e) => {
  console.error('[bot] ошибка:', e);
  process.exit(1);
});
