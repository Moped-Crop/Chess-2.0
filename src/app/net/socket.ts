/**
 * Единственный экземпляр socket.io-client. Подключается после логина
 * (аутентификация — той же httpOnly-cookie, что и REST). Модуль намеренно
 * не знает про сторы: страницы сами вешают обработчики и зовут методы стора.
 */

import { io, type Socket } from 'socket.io-client';
import type { Move } from '../../engine/types';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      withCredentials: true,
      // Небольшой автореконнект: обрывы Wi-Fi не должны рвать партию.
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

/** Подключить (идемпотентно). Вызывается после входа в аккаунт. */
export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

/** Отправить ход в онлайн-партии. index — номер хода до применения (защита от рассинхрона). */
export function emitMove(gameId: number, move: Move, index: number): void {
  getSocket().emit('move', { gameId, move, index });
}
