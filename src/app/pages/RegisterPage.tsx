import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useT, type StrKey } from '../i18n';
import { AuthShell, errorKey } from './authShared';

/** Страница регистрации: логин, email, пароль, отображаемое имя. */
export function RegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<StrKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({
        username: username.trim(),
        email: email.trim(),
        password,
        displayName: displayName.trim() || username.trim(),
      });
      navigate('/menu', { replace: true });
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('authRegister')}>
      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="field-label">{t('authUsername')}</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            required
          />
        </label>
        <label className="field">
          <span className="field-label">{t('authEmail')}</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
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
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">{t('authDisplayName')}</span>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={64}
          />
        </label>

        {error && <p className="form-error">{t(error)}</p>}

        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
          {busy ? t('loading') : t('authSubmitRegister')}
        </button>
      </form>

      <p className="auth-links">
        {t('authHaveAccount')} <Link to="/login">{t('authGoLogin')}</Link>
      </p>
    </AuthShell>
  );
}
