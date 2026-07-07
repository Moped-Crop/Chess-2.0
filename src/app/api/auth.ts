/** Типизированные вызовы аутентификации. */

import { api } from './client';

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarBase64: string | null;
}

interface UserResponse {
  user: PublicUser;
}

export function apiRegister(input: {
  username: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<UserResponse> {
  return api<UserResponse>('/api/auth/register', { method: 'POST', body: input });
}

export function apiLogin(login: string, password: string): Promise<UserResponse> {
  return api<UserResponse>('/api/auth/login', { method: 'POST', body: { login, password } });
}

export function apiLogout(): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function apiMe(): Promise<UserResponse> {
  return api<UserResponse>('/api/auth/me');
}
