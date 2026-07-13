/**
 * Экран-предложение включить 2FA сразу после подтверждения почты (регистрации).
 * Переиспользует поток включения; «Позже» уводит в меню без 2FA.
 */

import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiMe } from '../api/auth';
import { AuthShell } from './authShared';
import { TwoFactorEnable } from '../components/TwoFactorEnable';
import { useT } from '../i18n';

export function SecureAccountPage() {
  const t = useT();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const enabled = useAuthStore((s) => s.user?.totpEnabled) ?? false;

  // Уже включена — предлагать нечего.
  if (enabled) return <Navigate to="/menu" replace />;

  async function done() {
    try {
      const { user } = await apiMe();
      setUser(user);
    } catch {
      /* не критично */
    }
    navigate('/menu', { replace: true });
  }

  return (
    <AuthShell title={t('secureTitle')}>
      <p className="muted">{t('secureIntro')}</p>
      <TwoFactorEnable onDone={() => void done()} />
      <div className="secure-actions">
        <button
          className="btn btn-subtle btn-block"
          onClick={() => navigate('/menu', { replace: true })}
        >
          {t('secureSkip')}
        </button>
      </div>
    </AuthShell>
  );
}
