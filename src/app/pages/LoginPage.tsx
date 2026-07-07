import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useT, type StrKey } from '../i18n';
import { AuthShell, errorKey } from './authShared';

/** Страница входа: логин/email + пароль. */
export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [loginField, setLoginField] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<StrKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(loginField.trim(), password);
      navigate('/menu', { replace: true });
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('authLogin')}>
      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="field-label">{t('authLoginField')}</span>
          <input
            className="input"
            value={loginField}
            onChange={(e) => setLoginField(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="field">
          <span className="field-label">{t('authPassword')}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="form-error">{t(error)}</p>}

        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
          {busy ? t('loading') : t('authSubmitLogin')}
        </button>
      </form>

      <p className="auth-links">
        {t('authNoAccount')} <Link to="/register">{t('authGoRegister')}</Link>
      </p>
    </AuthShell>
  );
}
