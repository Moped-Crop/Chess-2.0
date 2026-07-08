/**
 * «Забыли пароль»: форма email. После отправки — нейтральное сообщение (не
 * подтверждаем, есть ли такой аккаунт в базе).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiForgotPassword } from '../api/auth';
import { useT, useLang, type StrKey } from '../i18n';
import { AuthShell, errorKey } from './authShared';

export function ForgotPasswordPage() {
  const t = useT();
  const lang = useLang();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<StrKey | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiForgotPassword(email.trim(), lang);
      setSent(true);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('forgotTitle')}>
      {sent ? (
        <p>{t('forgotSent')}</p>
      ) : (
        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">{t('forgotEmail')}</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          {error && <p className="form-error">{t(error)}</p>}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
            {busy ? t('loading') : t('forgotSubmit')}
          </button>
        </form>
      )}
      <p className="auth-links">
        <Link to="/login">{t('goLogin')}</Link>
      </p>
    </AuthShell>
  );
}
