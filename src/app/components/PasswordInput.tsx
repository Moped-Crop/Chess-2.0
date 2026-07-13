/**
 * Поле пароля с кнопкой «показать/скрыть». Ведёт себя как обычный input —
 * принимает те же пропсы (value, onChange, autoComplete, minLength и т.п.).
 */

import { useState, type InputHTMLAttributes } from 'react';
import { useT } from '../i18n';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function PasswordInput({ className, ...props }: Props) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <span className="password-input">
      <input {...props} type={show ? 'text' : 'password'} className={className ?? 'input'} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? t('hidePassword') : t('showPassword')}
        title={show ? t('hidePassword') : t('showPassword')}
      >
        {show ? (
          // eye-off
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          // eye
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}
