/** Общее для страниц входа: оболочка в стиле проекта и перевод ошибок API. */

import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { Brand } from '../components/Brand';
import type { StrKey } from '../i18n';

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
    }
  }
  return 'errUnknown';
}

/** Центрированная колонка: бренд сверху, карточка с формой под ним. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <Brand withSub={false} />
      <div className="card auth-card">
        <h2 className="auth-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
