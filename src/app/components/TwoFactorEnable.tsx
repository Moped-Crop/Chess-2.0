/**
 * Переиспользуемый поток ВКЛЮЧЕНИЯ 2FA: кнопка → QR-код + ввод кода → показ
 * резервных кодов один раз → onDone. Используется и в профиле («Безопасность»),
 * и на экране-предложении сразу после регистрации.
 */

import { useState } from 'react';
import { api2faSetup, api2faConfirm } from '../api/account';
import { useT, type StrKey } from '../i18n';
import { errorKey } from '../pages/authShared';

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * onDone вызывается, когда пользователь закрыл экран резервных кодов. Обновление
 * стора (user.totpEnabled) и навигацию делает вызывающий код в onDone — до этого
 * момента компонент должен оставаться смонтированным, иначе резервные коды
 * исчезнут с экрана раньше, чем пользователь их сохранит.
 */
export function TwoFactorEnable({ onDone }: { onDone?: () => void }) {
  const t = useT();

  const [setup, setSetup] = useState<{ qr: string; key: string } | null>(null);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StrKey | null>(null);

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
    } catch (ex) {
      setErr(errorKey(ex));
    } finally {
      setBusy(false);
    }
  }

  // Экран резервных кодов (один раз).
  if (backup) {
    return (
      <div className="backup-codes">
        <p className="sec-heading">{t('sec2faBackupTitle')}</p>
        <p className="muted">{t('sec2faBackupWarning')}</p>
        <ul className="backup-list">
          {backup.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="btn-row">
          <button
            className="btn btn-subtle"
            onClick={() => download('chess2-backup-codes.txt', backup.join('\n'))}
          >
            {t('sec2faBackupDownload')}
          </button>
          <button className="btn btn-primary" onClick={() => onDone?.()}>
            {t('done')}
          </button>
        </div>
      </div>
    );
  }

  // Экран QR + ввод кода.
  if (setup) {
    return (
      <form onSubmit={confirm}>
        <p className="muted">{t('sec2faScan')}</p>
        <img className="totp-qr" src={setup.qr} alt="QR" />
        <p className="muted">
          {t('sec2faManual')} <code>{setup.key}</code>
        </p>
        <label className="field">
          <span className="field-label">{t('sec2faEnterCode')}</span>
          <input
            className="input"
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        {err && <p className="form-error">{t(err)}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {t('sec2faConfirmBtn')}
        </button>
      </form>
    );
  }

  // Стартовая кнопка.
  return (
    <>
      {err && <p className="form-error">{t(err)}</p>}
      <button className="btn btn-primary" onClick={() => void startSetup()} disabled={busy}>
        {t('sec2faEnable')}
      </button>
    </>
  );
}
