/**
 * Блок «Безопасность» на странице профиля: смена пароля/логина/почты, 2FA
 * (включение через QR + резервные коды, отключение) и удаление аккаунта.
 *
 * Оформление — в стиле существующих карточек (.card/.field/.btn); чистовой
 * редизайн менюшек будет отдельной фазой. Баннер про неподтверждённую почту
 * здесь не нужен: раз пользователь залогинен, почта уже подтверждена.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiMe } from '../api/auth';
import {
  apiChangePassword,
  apiChangeUsername,
  apiChangeEmail,
  api2faDisable,
  apiDeleteAccount,
} from '../api/account';
import { useT, useLang, type StrKey } from '../i18n';
import { errorKey } from './authShared';
import { PasswordInput } from '../components/PasswordInput';
import { TwoFactorEnable } from '../components/TwoFactorEnable';

/** Мелкий помощник: строка статуса (успех/ошибка) под формой. */
function Status({ ok, err }: { ok: StrKey | null; err: StrKey | null }) {
  const t = useT();
  if (ok) return <p className="form-ok">{t(ok)}</p>;
  if (err) return <p className="form-error">{t(err)}</p>;
  return null;
}

/**
 * Поле ввода кода 2FA — показывается ТОЛЬКО если у пользователя включена
 * двухфакторка. Тогда смена пароля/логина/почты требует подтверждения кодом.
 */
function TwoFaField({ code, setCode }: { code: string; setCode: (v: string) => void }) {
  const t = useT();
  const enabled = useAuthStore((s) => s.user?.totpEnabled) ?? false;
  if (!enabled) return null;
  return (
    <label className="field">
      <span className="field-label">{t('login2faCode')}</span>
      <input
        className="input"
        value={code}
        inputMode="text"
        autoComplete="one-time-code"
        onChange={(e) => setCode(e.target.value)}
        required
      />
    </label>
  );
}

/* ---------- Смена пароля ---------- */

function ChangePassword() {
  const t = useT();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<StrKey | null>(null);
  const [err, setErr] = useState<StrKey | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk(null);
    setErr(null);
    try {
      await apiChangePassword(cur, next, code || undefined);
      setOk('savedGeneric');
      setCur('');
      setNext('');
      setCode('');
    } catch (ex) {
      setErr(errorKey(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sec-block" onSubmit={submit}>
      <h4 className="sec-heading">{t('secChangePassword')}</h4>
      <label className="field">
        <span className="field-label">{t('secCurrentPassword')}</span>
        <PasswordInput value={cur} autoComplete="current-password" onChange={(e) => setCur(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">{t('secNewPassword')}</span>
        <PasswordInput value={next} autoComplete="new-password" minLength={8} maxLength={128} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <TwoFaField code={code} setCode={setCode} />
      <Status ok={ok} err={err} />
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {t('secChangePasswordBtn')}
      </button>
    </form>
  );
}

/* ---------- Смена логина ---------- */

function ChangeUsername() {
  const t = useT();
  const setUser = useAuthStore((s) => s.setUser);
  const [cur, setCur] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<StrKey | null>(null);
  const [err, setErr] = useState<StrKey | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk(null);
    setErr(null);
    try {
      const { user } = await apiChangeUsername(cur, name.trim(), code || undefined);
      setUser(user);
      setOk('savedGeneric');
      setCur('');
      setName('');
      setCode('');
    } catch (ex) {
      setErr(errorKey(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sec-block" onSubmit={submit}>
      <h4 className="sec-heading">{t('secChangeUsername')}</h4>
      <label className="field">
        <span className="field-label">{t('secCurrentPassword')}</span>
        <PasswordInput value={cur} autoComplete="current-password" onChange={(e) => setCur(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">{t('secNewUsername')}</span>
        <input className="input" value={name} minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" onChange={(e) => setName(e.target.value)} required />
      </label>
      <TwoFaField code={code} setCode={setCode} />
      <Status ok={ok} err={err} />
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {t('secChangeUsernameBtn')}
      </button>
    </form>
  );
}

/* ---------- Смена почты ---------- */

function ChangeEmail() {
  const t = useT();
  const lang = useLang();
  const [cur, setCur] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StrKey | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { pendingEmail } = await apiChangeEmail(cur, email.trim(), lang, code || undefined);
      setPending(pendingEmail);
      setCur('');
      setEmail('');
      setCode('');
    } catch (ex) {
      setErr(errorKey(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sec-block" onSubmit={submit}>
      <h4 className="sec-heading">{t('secChangeEmail')}</h4>
      {pending && (
        <p className="form-ok">
          {t('secEmailPending')} <strong>{pending}</strong>
        </p>
      )}
      <label className="field">
        <span className="field-label">{t('secCurrentPassword')}</span>
        <PasswordInput value={cur} autoComplete="current-password" onChange={(e) => setCur(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">{t('secNewEmail')}</span>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <TwoFaField code={code} setCode={setCode} />
      <Status ok={null} err={err} />
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {t('secChangeEmailBtn')}
      </button>
    </form>
  );
}

/* ---------- Двухфакторная аутентификация ---------- */

function TwoFactor() {
  const t = useT();
  const enabled = useAuthStore((s) => s.user?.totpEnabled) ?? false;
  const setUser = useAuthStore((s) => s.setUser);

  const [disCur, setDisCur] = useState('');
  const [disCode, setDisCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StrKey | null>(null);

  async function refreshUser() {
    try {
      const { user: fresh } = await apiMe();
      setUser(fresh);
    } catch {
      /* не критично */
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api2faDisable(disCur, disCode.trim());
      setDisCur('');
      setDisCode('');
      await refreshUser();
    } catch (ex) {
      setErr(errorKey(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sec-block">
      <h4 className="sec-heading">
        {t('sec2faTitle')} — <span className={enabled ? 'badge-on' : 'badge-off'}>{enabled ? t('sec2faOn') : t('sec2faOff')}</span>
      </h4>

      {/* Включение — переиспользуемый поток; по завершении обновляем стор. */}
      {!enabled && <TwoFactorEnable onDone={() => void refreshUser()} />}

      {enabled && (
        <form onSubmit={disable}>
          <label className="field">
            <span className="field-label">{t('secCurrentPassword')}</span>
            <PasswordInput value={disCur} autoComplete="current-password" onChange={(e) => setDisCur(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">{t('sec2faDisableCode')}</span>
            <input className="input" value={disCode} inputMode="text" onChange={(e) => setDisCode(e.target.value)} required />
          </label>
          <Status ok={null} err={err} />
          <button className="btn btn-danger" type="submit" disabled={busy}>
            {t('sec2faDisable')}
          </button>
        </form>
      )}
    </div>
  );
}

/* ---------- Удаление аккаунта ---------- */

function DeleteAccount() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'password' | 'totp' | 'email'>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StrKey | null>(null);

  function reset() {
    setOpen(false);
    setStep('password');
    setPassword('');
    setCode('');
    setErr(null);
  }

  // Первый шаг: пароль → сервер решает, каким кодом подтверждать.
  async function firstCall(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await apiDeleteAccount({ currentPassword: password, lang });
      if ('status' in r && r.status === 'totp_required') setStep('totp');
      else if ('status' in r && r.status === 'email_code_sent') setStep('email');
    } catch (ex) {
      setErr(errorKey(ex));
    } finally {
      setBusy(false);
    }
  }

  // Второй шаг: пароль + код (TOTP или из письма).
  async function secondCall(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body =
        step === 'totp'
          ? { currentPassword: password, totpCode: code.trim(), lang }
          : { currentPassword: password, emailCode: code.trim(), lang };
      const r = await apiDeleteAccount(body);
      if ('ok' in r && r.ok) {
        await logout();
        navigate('/login', { replace: true });
      }
    } catch (ex) {
      setErr(errorKey(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sec-block danger-zone">
      <h4 className="sec-heading">{t('delTitle')}</h4>
      <p className="muted">{t('delIntro')}</p>
      <button className="btn btn-danger" onClick={() => setOpen(true)}>
        {t('delTitle')}
      </button>

      {open && (
        <div className="overlay" onClick={reset}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('delTitle')}</h3>

            {step === 'password' && (
              <form onSubmit={firstCall}>
                <p className="muted">{t('delPasswordPrompt')}</p>
                <label className="field">
                  <span className="field-label">{t('secCurrentPassword')}</span>
                  <PasswordInput value={password} autoFocus autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />
                </label>
                {err && <p className="form-error">{t(err)}</p>}
                <div className="btn-row">
                  <button className="btn btn-subtle" type="button" onClick={reset}>
                    {t('cancel')}
                  </button>
                  <button className="btn btn-primary" type="submit" disabled={busy}>
                    {t('delContinue')}
                  </button>
                </div>
              </form>
            )}

            {(step === 'totp' || step === 'email') && (
              <form onSubmit={secondCall}>
                <p className="muted">{step === 'totp' ? t('delTotpPrompt') : t('delEmailSent')}</p>
                <label className="field">
                  <span className="field-label">{step === 'totp' ? t('login2faCode') : t('delEmailCode')}</span>
                  <input className="input" value={code} autoFocus inputMode={step === 'email' ? 'numeric' : 'text'} onChange={(e) => setCode(e.target.value)} required />
                </label>
                <p className="form-error">{t('delFinalWarning')}</p>
                {err && <p className="form-error">{t(err)}</p>}
                <div className="btn-row">
                  <button className="btn btn-subtle" type="button" onClick={reset}>
                    {t('cancel')}
                  </button>
                  <button className="btn btn-danger" type="submit" disabled={busy}>
                    {t('delConfirmBtn')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Сборка блока ---------- */

export function ProfileSecurity() {
  const t = useT();
  return (
    <div className="card profile-card">
      <h3 className="section-title">{t('secTitle')}</h3>
      <ChangePassword />
      <ChangeUsername />
      <ChangeEmail />
      <TwoFactor />
      <DeleteAccount />
    </div>
  );
}
