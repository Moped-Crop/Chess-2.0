/**
 * Сброс пароля по ссылке из письма: читаем token из query, форма нового пароля.
 * После успеха предлагаем войти (сессия не создаётся — token_version сброшен).
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiResetPassword } from '../api/auth';
import { useT, type StrKey } from '../i18n';
import { AuthShell, errorKey } from './authShared';
import { PasswordInput } from '../components/PasswordInput';

export function ResetPasswordPage() {
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<StrKey | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError('errInvalidToken');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiResetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('resetTitle')}>
      {done ? (
        <>
          <p className="form-ok">{t('resetDone')}</p>
          <p className="auth-links">
            <Link to="/login">{t('goLogin')}</Link>
          </p>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">{t('resetNewPassword')}</span>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          {error && <p className="form-error">{t(error)}</p>}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
            {busy ? t('loading') : t('resetSubmit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
