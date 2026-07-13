/** Типизированные вызовы настроек аккаунта (/api/account). */

import { api } from './client';
import type { PublicUser } from './auth';
import type { Lang } from '../i18n';

// code — второй фактор (TOTP или резервный код); нужен, только если у
// пользователя включена 2FA.
export function apiChangePassword(
  currentPassword: string,
  newPassword: string,
  code?: string,
): Promise<{ ok: boolean }> {
  return api('/api/account/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword, code },
  });
}

export function apiChangeUsername(
  currentPassword: string,
  newUsername: string,
  code?: string,
): Promise<{ user: PublicUser }> {
  return api('/api/account/change-username', {
    method: 'POST',
    body: { currentPassword, newUsername, code },
  });
}

export function apiChangeEmail(
  currentPassword: string,
  newEmail: string,
  lang?: Lang,
  code?: string,
): Promise<{ ok: boolean; pendingEmail: string }> {
  return api('/api/account/change-email', {
    method: 'POST',
    body: { currentPassword, newEmail, lang, code },
  });
}

export function apiConfirmEmailChange(token: string): Promise<{ ok: boolean }> {
  return api('/api/account/confirm-email-change', { method: 'POST', body: { token } });
}

export function api2faSetup(): Promise<{ qrCodeDataUrl: string; manualEntryKey: string }> {
  return api('/api/account/2fa/setup', { method: 'POST' });
}

export function api2faConfirm(code: string): Promise<{ backupCodes: string[] }> {
  return api('/api/account/2fa/confirm', { method: 'POST', body: { code } });
}

export function api2faDisable(currentPassword: string, code: string): Promise<{ ok: boolean }> {
  return api('/api/account/2fa/disable', { method: 'POST', body: { currentPassword, code } });
}

/** Удаление — два вызова: первый без кодов, второй с totpCode или emailCode. */
export type DeleteResult =
  | { status: 'totp_required' }
  | { status: 'email_code_sent' }
  | { ok: true };

export function apiDeleteAccount(input: {
  currentPassword: string;
  totpCode?: string;
  emailCode?: string;
  lang?: Lang;
}): Promise<DeleteResult> {
  return api('/api/account/delete', { method: 'POST', body: input });
}
