/**
 * Переход по ссылке из письма подтверждения: сразу шлём verify-email. Успех —
 * сессия ставится мгновенно (эквивалент логина) и уводим в меню. Ошибка —
 * сообщение + возможность ввести email и переотправить письмо.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiVerifyEmail } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { useT, type StrKey } from '../i18n';
import { AuthShell, errorKey } from './authShared';
import { CheckEmailNotice } from '../components/CheckEmailNotice';

export function VerifyEmailPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const completeLogin = useAuthStore((s) => s.completeLogin);

  const [error, setError] = useState<StrKey | null>(null);
  const [resendEmail, setResendEmail] = useState('');
  const [showNotice, setShowNotice] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('token');
    if (!token) {
      setError('errInvalidToken');
      return;
    }
    apiVerifyEmail(token)
      .then(({ user }) => {
        completeLogin(user);
        // Сразу после регистрации предлагаем включить 2FA.
        navigate('/secure-account', { replace: true });
      })
      .catch((e) => setError(errorKey(e)));
  }, [params, completeLogin, navigate]);

  if (!error) {
    return (
      <AuthShell title={t('checkEmailTitle')}>
        <p className="page-loader">{t('verifyingEmail')}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('verifyFailedTitle')}>
      <p className="form-error">{t(error)}</p>
      {showNotice ? (
        <CheckEmailNotice email={showNotice} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setShowNotice(resendEmail.trim());
          }}
        >
          <label className="field">
            <span className="field-label">{t('authEmail')}</span>
            <input
              className="input"
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              required
            />
          </label>
          <button className="btn btn-primary btn-block" type="submit">
            {t('resendBtn')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
