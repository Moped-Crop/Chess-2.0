/**
 * Подтверждение смены почты по ссылке из письма (публичная страница): читаем
 * token из query, шлём confirm-email-change. Показываем результат.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiConfirmEmailChange } from '../api/account';
import { useT, type StrKey } from '../i18n';
import { AuthShell, errorKey } from './authShared';

type Phase = 'working' | 'done' | 'error';

export function ConfirmEmailChangePage() {
  const t = useT();
  const [params] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('working');
  const [error, setError] = useState<StrKey | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('token');
    if (!token) {
      setError('errInvalidToken');
      setPhase('error');
      return;
    }
    apiConfirmEmailChange(token)
      .then(() => setPhase('done'))
      .catch((e) => {
        setError(errorKey(e));
        setPhase('error');
      });
  }, [params]);

  return (
    <AuthShell title={t('confirmEmailTitle')}>
      {phase === 'working' && <p className="page-loader">{t('confirmEmailWorking')}</p>}
      {phase === 'done' && <p className="form-ok">{t('confirmEmailDone')}</p>}
      {phase === 'error' && (
        <p className="form-error">{error ? t(error) : t('confirmEmailFailed')}</p>
      )}
      <p className="auth-links">
        <Link to="/menu">{t('toMenu')}</Link>
      </p>
    </AuthShell>
  );
}
