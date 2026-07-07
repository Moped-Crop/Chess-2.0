/**
 * Онлайн-статусы: userId → множество активных socketId. Заполняется слоем
 * Socket.IO (connection/disconnect), читается REST-роутом друзей.
 * Хранится в памяти процесса — по требованиям MVP.
 */

const sockets = new Map<number, Set<string>>();

export function markOnline(userId: number, socketId: string): void {
  let set = sockets.get(userId);
  if (!set) {
    set = new Set();
    sockets.set(userId, set);
  }
  set.add(socketId);
}

export function markOffline(userId: number, socketId: string): void {
  const set = sockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) sockets.delete(userId);
}

export function isOnline(userId: number): boolean {
  return sockets.has(userId);
}

/** Все socketId пользователя (доставка приглашений во все вкладки). */
export function socketsOf(userId: number): string[] {
  return [...(sockets.get(userId) ?? [])];
}
