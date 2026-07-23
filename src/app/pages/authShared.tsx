/** Общее для страниц входа: оболочка в стиле проекта и перевод ошибок API. */

import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { Brand } from '../components/Brand';
import type { Lang, StrKey } from '../i18n';
import { useLang } from '../i18n';
import { useGameStore } from '../store/gameStore';
import { SegmentedControl, type SegOption } from '../components/ui';

/** Код ошибки API → ключ перевода для показа пользователю. */
export function errorKey(e: unknown): StrKey {
  if (e instanceof ApiError) {
    if (e.status === 429) return 'errRateLimit';
    switch (e.code) {
      case 'bad_credentials':
        return 'errBadCredentials';
      case 'username_taken':
        return 'errUsernameTaken';
      case 'email_taken':
        return 'errEmailTaken';
      case 'validation':
        return 'errValidation';
      case 'network':
        return 'errNetwork';
      case 'email_not_verified':
        return 'errEmailNotVerified';
      case 'wrong_password':
        return 'errWrongPassword';
      case 'invalid_token':
        return 'errInvalidToken';
      case 'token_expired':
        return 'errTokenExpired';
      case 'totp_invalid':
        return 'errTotpInvalid';
      case 'code_invalid':
        return 'errCodeInvalid';
      case 'too_many_attempts':
        return 'errTooManyAttempts';
    }
  }
  return 'errUnknown';
}

const LANG_OPTIONS: SegOption<Lang>[] = [
  { value: 'ru', label: 'RU' },
  { value: 'en', label: 'EN' },
];

/** Переключатель языка (RU/EN) для экранов входа/регистрации. */
function AuthLangSwitch() {
  const lang = useLang();
  const setLang = useGameStore((s) => s.setLang);
  return (
    <div className="auth-lang">
      <SegmentedControl options={LANG_OPTIONS} value={lang} onChange={setLang} ariaLabel="Language" />
    </div>
  );
}

/** Центрированная колонка: бренд сверху, карточка с формой под ним. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <Brand />
      <div className="card auth-card">
        <AuthLangSwitch />
        <h2 className="auth-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
