/** Типизированные вызовы аутентификации. */

import { api } from './client';
import type { Lang } from '../i18n';

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarBase64: string | null;
  totpEnabled: boolean;
}

interface UserResponse {
  user: PublicUser;
}

/** Регистрация больше НЕ создаёт сессию — приходит письмо подтверждения. */
export function apiRegister(input: {
  username: string;
  email: string;
  password: string;
  displayName: string;
  lang?: Lang;
}): Promise<{ status: 'verify_email_sent'; email: string }> {
  return api('/api/auth/register', { method: 'POST', body: input });
}

/** Логин: либо сразу сессия ({ user }), либо запрос второго фактора. */
export type LoginResult = UserResponse | { requires2fa: true; challenge: string };

export function apiLogin(login: string, password: string): Promise<LoginResult> {
  return api<LoginResult>('/api/auth/login', { method: 'POST', body: { login, password } });
}

export function apiVerify2fa(challenge: string, code: string): Promise<UserResponse> {
  return api<UserResponse>('/api/auth/login/verify-2fa', {
    method: 'POST',
    body: { challenge, code },
  });
}

export function apiVerifyEmail(token: string): Promise<UserResponse> {
  return api<UserResponse>('/api/auth/verify-email', { method: 'POST', body: { token } });
}

export function apiResendVerification(email: string, lang?: Lang): Promise<{ ok: boolean }> {
  return api('/api/auth/resend-verification', { method: 'POST', body: { email, lang } });
}

export function apiForgotPassword(email: string, lang?: Lang): Promise<{ ok: boolean }> {
  return api('/api/auth/forgot-password', { method: 'POST', body: { email, lang } });
}

export function apiResetPassword(token: string, newPassword: string): Promise<{ ok: boolean }> {
  return api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword } });
}

export function apiLogout(): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function apiMe(): Promise<UserResponse> {
  return api<UserResponse>('/api/auth/me');
}
