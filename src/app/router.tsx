/**
 * Маршруты приложения. Локальная игра (/play/local) — прежний App без
 * изменений. Тема оформления применяется здесь, чтобы действовать на всех
 * страницах, а не только в игре.
 */

import { useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { App } from './App';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { MenuPage } from './pages/MenuPage';
import { ProfilePage } from './pages/ProfilePage';
import { FriendsPage } from './pages/FriendsPage';
import { useAuthStore } from './store/authStore';
import { useGameStore } from './store/gameStore';
import { useT } from './i18n';

function Loader() {
  const t = useT();
  return <div className="page-loader">{t('loading')}</div>;
}

/** Гард: пускает только авторизованных; на время проверки — заглушка. */
function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'checking') return <Loader />;
  if (status === 'guest') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Корень: в меню при живой сессии, иначе на вход. */
function HomeRedirect() {
  const status = useAuthStore((s) => s.status);
  if (status === 'checking') return <Loader />;
  return <Navigate to={status === 'authed' ? '/menu' : '/login'} replace />;
}

export function AppRouter() {
  const init = useAuthStore((s) => s.init);
  const uiTheme = useGameStore((s) => s.uiTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
  }, [uiTheme]);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/menu"
        element={
          <RequireAuth>
            <MenuPage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/friends"
        element={
          <RequireAuth>
            <FriendsPage />
          </RequireAuth>
        }
      />
      <Route path="/play/local" element={<App />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
