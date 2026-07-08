import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiVerify2fa } from '../api/auth';
import { ApiError } from '../api/client';
import { useT, type StrKey } from '../i18n';
import { AuthShell, errorKey } from './authShared';
import { CheckEmailNotice } from '../components/CheckEmailNotice';

/** Страница входа: логин/email + пароль, с ветками «подтвердите почту» и 2FA. */
export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const completeLogin = useAuthStore((s) => s.completeLogin);

  const [loginField, setLoginField] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<StrKey | null>(null);
  const [busy, setBusy] = useState(false);

  // Ветки после первой попытки входа.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(loginField.trim(), password);
      if ('requires2fa' in result) {
        setChallenge(result.challenge); // показать экран ввода 2FA-кода
      } else {
        navigate('/menu', { replace: true });
      }
    } catch (err) {
      // Неподтверждённая почта — показываем «проверьте почту» вместо ошибки.
      if (err instanceof ApiError && err.status === 403 && err.code === 'email_not_verified') {
        setUnverifiedEmail(loginField.includes('@') ? loginField.trim() : '');
      } else {
        setError(errorKey(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await apiVerify2fa(challenge, code.trim());
      completeLogin(user);
      navigate('/menu', { replace: true });
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  // Экран «проверьте почту» (сервер вернул email_not_verified).
  if (unverifiedEmail !== null) {
    return (
      <AuthShell title={t('checkEmailTitle')}>
        {unverifiedEmail ? (
          <CheckEmailNotice email={unverifiedEmail} />
        ) : (
          <p>{t('errEmailNotVerified')}</p>
        )}
        <p className="auth-links">
          <button className="link-btn" onClick={() => setUnverifiedEmail(null)}>
            {t('back')}
          </button>
        </p>
      </AuthShell>
    );
  }

  // Второй экран той же формы: ввод 2FA-кода.
  if (challenge) {
    return (
      <AuthShell title={t('login2faTitle')}>
        <form onSubmit={onVerify2fa}>
          <label className="field">
            <span className="field-label">{t('login2faCode')}</span>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              inputMode="text"
              autoFocus
              required
            />
          </label>
          {error && <p className="form-error">{t(error)}</p>}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
            {busy ? t('loading') : t('login2faSubmit')}
          </button>
        </form>
        <p className="auth-links">
          <button className="link-btn" onClick={() => setChallenge(null)}>
            {t('back')}
          </button>
        </p>
      </AuthShell>
    );
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
        <Link to="/forgot-password">{t('forgotLink')}</Link>
      </p>
      <p className="auth-links">
        {t('authNoAccount')} <Link to="/register">{t('authGoRegister')}</Link>
      </p>
    </AuthShell>
  );
}
