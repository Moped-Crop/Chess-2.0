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
  api2faSetup,
  api2faConfirm,
  api2faDisable,
  apiDeleteAccount,
} from '../api/account';
import { useT, useLang, type StrKey } from '../i18n';
import { errorKey } from './authShared';

/** Мелкий помощник: строка статуса (успех/ошибка) под формой. */
function Status({ ok, err }: { ok: StrKey | null; err: StrKey | null }) {
  const t = useT();
  if (ok) return <p className="form-ok">{t(ok)}</p>;
  if (err) return <p className="form-error">{t(err)}</p>;
  return null;
}

/* ---------- Смена пароля ---------- */

function ChangePassword() {
  const t = useT();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<StrKey | null>(null);
  const [err, setErr] = useState<StrKey | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk(null);
    setErr(null);
    try {
      await apiChangePassword(cur, next);
      setOk('savedGeneric');
      setCur('');
      setNext('');
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
        <input className="input" type="password" value={cur} autoComplete="current-password" onChange={(e) => setCur(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">{t('secNewPassword')}</span>
        <input className="input" type="password" value={next} autoComplete="new-password" minLength={8} maxLength={128} onChange={(e) => setNext(e.target.value)} required />
      </label>
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
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<StrKey | null>(null);
  const [err, setErr] = useState<StrKey | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk(null);
    setErr(null);
    try {
      const { user } = await apiChangeUsername(cur, name.trim());
      setUser(user);
      setOk('savedGeneric');
      setCur('');
      setName('');
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
        <input className="input" type="password" value={cur} autoComplete="current-password" onChange={(e) => setCur(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">{t('secNewUsername')}</span>
        <input className="input" value={name} minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" onChange={(e) => setName(e.target.value)} required />
      </label>
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
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StrKey | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { pendingEmail } = await apiChangeEmail(cur, email.trim(), lang);
      setPending(pendingEmail);
      setCur('');
      setEmail('');
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
        <input className="input" type="password" value={cur} autoComplete="current-password" onChange={(e) => setCur(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">{t('secNewEmail')}</span>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <Status ok={null} err={err} />
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {t('secChangeEmailBtn')}
      </button>
    </form>
  );
}

/* ---------- Двухфакторная аутентификация ---------- */

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TwoFactor() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const enabled = user?.totpEnabled ?? false;

  // Включение.
  const [setup, setSetup] = useState<{ qr: string; key: string } | null>(null);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState<string[] | null>(null);
  // Отключение.
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

  async function startSetup() {
    setErr(null);
    setBusy(true);
    try {
      const { qrCodeDataUrl, manualEntryKey } = await api2faSetup();
      setSetup({ qr: qrCodeDataUrl, key: manualEntryKey });
    } catch (ex) {
      setErr(errorKey(ex));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { backupCodes } = await api2faConfirm(code.trim());
      setBackup(backupCodes);
      setSetup(null);
      setCode('');
      await refreshUser();
    } catch (ex) {
      setErr(errorKey(ex));
    } finally {
      setBusy(false);
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

      {/* Показ резервных кодов один раз после включения. */}
      {backup && (
        <div className="backup-codes">
          <p className="sec-heading">{t('sec2faBackupTitle')}</p>
          <p className="muted">{t('sec2faBackupWarning')}</p>
          <ul className="backup-list">
            {backup.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="btn-row">
            <button className="btn btn-subtle" onClick={() => download('chess2-backup-codes.txt', backup.join('\n'))}>
              {t('sec2faBackupDownload')}
            </button>
            <button className="btn btn-primary" onClick={() => setBackup(null)}>
              {t('done')}
            </button>
          </div>
        </div>
      )}

      {!backup && !enabled && !setup && (
        <button className="btn btn-primary" onClick={() => void startSetup()} disabled={busy}>
          {t('sec2faEnable')}
        </button>
      )}

      {!backup && !enabled && setup && (
        <form onSubmit={confirm}>
          <p className="muted">{t('sec2faScan')}</p>
          <img className="totp-qr" src={setup.qr} alt="QR" />
          <p className="muted">
            {t('sec2faManual')} <code>{setup.key}</code>
          </p>
          <label className="field">
            <span className="field-label">{t('sec2faEnterCode')}</span>
            <input className="input" value={code} inputMode="numeric" autoComplete="one-time-code" onChange={(e) => setCode(e.target.value)} required />
          </label>
          <Status ok={null} err={err} />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {t('sec2faConfirmBtn')}
          </button>
        </form>
      )}

      {!backup && enabled && (
        <form onSubmit={disable}>
          <label className="field">
            <span className="field-label">{t('secCurrentPassword')}</span>
            <input className="input" type="password" value={disCur} autoComplete="current-password" onChange={(e) => setDisCur(e.target.value)} required />
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

      {err && !setup && !enabled && !backup && <p className="form-error">{t(err)}</p>}
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
                  <input className="input" type="password" value={password} autoFocus autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />
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
