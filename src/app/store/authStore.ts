/**
 * Сессия пользователя. status:
 *  - 'checking' — при старте выясняем, есть ли сессия (GET /me);
 *  - 'guest'    — не авторизован;
 *  - 'authed'   — авторизован, user заполнен.
 */

import { create } from 'zustand';
import { apiLogin, apiLogout, apiMe, apiRegister, type PublicUser } from '../api/auth';
import { ApiError } from '../api/client';

export type AuthStatus = 'checking' | 'guest' | 'authed';

interface AuthStore {
  status: AuthStatus;
  user: PublicUser | null;

  /** Однократная проверка сессии при старте приложения. */
  init: () => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  register: (input: {
    username: string;
    email: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  /** Обновить данные пользователя после изменения профиля. */
  setUser: (user: PublicUser) => void;
}

let initStarted = false;

export const useAuthStore = create<AuthStore>()((set) => ({
  status: 'checking',
  user: null,

  init: async () => {
    if (initStarted) return;
    initStarted = true;
    try {
      const { user } = await apiMe();
      set({ status: 'authed', user });
    } catch {
      set({ status: 'guest', user: null });
    }
  },

  login: async (login, password) => {
    const { user } = await apiLogin(login, password);
    set({ status: 'authed', user });
  },

  register: async (input) => {
    const { user } = await apiRegister(input);
    set({ status: 'authed', user });
  },

  logout: async () => {
    try {
      await apiLogout();
    } catch (e) {
      // Сеть могла упасть — локально всё равно выходим.
      if (!(e instanceof ApiError)) throw e;
    }
    set({ status: 'guest', user: null });
  },

  setUser: (user) => set({ user }),
}));
