/**
 * Сессия пользователя. status:
 *  - 'checking' — при старте выясняем, есть ли сессия (GET /me);
 *  - 'guest'    — не авторизован;
 *  - 'authed'   — авторизован, user заполнен.
 *
 * Регистрация больше НЕ создаёт сессию (нужно подтверждение почты), а логин
 * может потребовать второй фактор — поэтому login/register возвращают результат,
 * а страницы решают, что показать дальше. Готовую сессию ставит completeLogin
 * (после подтверждения почты или ввода 2FA-кода).
 */

import { create } from 'zustand';
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  type LoginResult,
  type PublicUser,
} from '../api/auth';
import { ApiError } from '../api/client';
import type { Lang } from '../i18n';

export type AuthStatus = 'checking' | 'guest' | 'authed';

interface AuthStore {
  status: AuthStatus;
  user: PublicUser | null;

  /** Однократная проверка сессии при старте приложения. */
  init: () => Promise<void>;
  /** Логин: возвращает результат (сессия или требование 2FA). */
  login: (login: string, password: string) => Promise<LoginResult>;
  register: (input: {
    username: string;
    email: string;
    password: string;
    displayName: string;
    lang?: Lang;
  }) => Promise<{ status: 'verify_email_sent'; email: string }>;
  /** Пометить сессию активной (после verify-email / verify-2fa / login без 2FA). */
  completeLogin: (user: PublicUser) => void;
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
    const result = await apiLogin(login, password);
    if ('user' in result) set({ status: 'authed', user: result.user });
    return result;
  },

  register: (input) => apiRegister(input),

  completeLogin: (user) => set({ status: 'authed', user }),

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
