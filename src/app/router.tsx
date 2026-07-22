/**
 * Маршруты приложения. Локальная игра (/play/local) — прежний App без
 * изменений. Тема оформления применяется здесь, чтобы действовать на всех
 * страницах, а не только в игре.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { App } from './App';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ConfirmEmailChangePage } from './pages/ConfirmEmailChangePage';
import { MenuPage } from './pages/MenuPage';
import { SecureAccountPage } from './pages/SecureAccountPage';
import { ProfilePage } from './pages/ProfilePage';
import { FriendsPage } from './pages/FriendsPage';
import { PlayerProfilePage } from './pages/PlayerProfilePage';
import { OnlineGamePage } from './pages/OnlineGamePage';
import { GameHistoryPage } from './pages/GameHistoryPage';
import { GameReplayPage } from './pages/GameReplayPage';
import { HowToPlayPage } from './pages/HowToPlayPage';
import { BotSetupPage } from './pages/BotSetupPage';
import { BotGamePage } from './pages/BotGamePage';
import { ChatsListPage } from './pages/ChatsListPage';
import { ChatThreadPage } from './pages/ChatThreadPage';
import { RankedPage } from './pages/RankedPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { UiKitPage } from './pages/UiKitPage'; // ВРЕМЕННО (чекпоинт 2), удалить в конце фазы
import { InviteLayer } from './components/InviteLayer';
import { ChatLayer } from './components/ChatLayer';
import { useAuthStore } from './store/authStore';
import { useGameStore } from './store/gameStore';
import { useT } from './i18n';

/**
 * Отложенный лоадер: проверка сессии обычно занимает десятки миллисекунд, и
 * мгновенный серый блок «Загрузка…» успевал только мигнуть. Первые 300 мс не
 * рендерим ничего — при быстрой проверке экран просто спокоен; надпись
 * появляется только если проверка действительно затянулась. Логика
 * RequireAuth/HomeRedirect не изменена — это чисто визуальная задержка.
 */
function Loader() {
  const t = useT();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(id);
  }, []);
  if (!visible) return null;
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
    <>
      <InviteLayer />
      <ChatLayer />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Публичные ссылки из писем — без RequireAuth. */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />
      <Route
        path="/menu"
        element={
          <RequireAuth>
            <MenuPage />
          </RequireAuth>
        }
      />
      <Route
        path="/secure-account"
        element={
          <RequireAuth>
            <SecureAccountPage />
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
      {/* Переписка с друзьями: список бесед и отдельный тред. */}
      <Route
        path="/chats"
        element={
          <RequireAuth>
            <ChatsListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/chats/:friendshipId"
        element={
          <RequireAuth>
            <ChatThreadPage />
          </RequireAuth>
        }
      />
      {/* Read-only профиль другого игрока (свой ник уводит на /profile). */}
      <Route
        path="/players/:username"
        element={
          <RequireAuth>
            <PlayerProfilePage />
          </RequireAuth>
        }
      />
      {/* Рейтинговый матч: поиск соперника по рейтингу. */}
      <Route
        path="/play/ranked"
        element={
          <RequireAuth>
            <RankedPage />
          </RequireAuth>
        }
      />
      <Route
        path="/leaderboard"
        element={
          <RequireAuth>
            <LeaderboardPage />
          </RequireAuth>
        }
      />
      <Route path="/play/local" element={<App />} />
      {/* Партия с ботом — целиком в браузере, сервер ей не нужен. */}
      <Route path="/play/bot/setup" element={<BotSetupPage />} />
      <Route path="/play/bot" element={<BotGamePage />} />
      {/* Обучение доступно и без логина — ничего серверного ему не нужно. */}
      <Route path="/how-to-play" element={<HowToPlayPage />} />
      {/* ВРЕМЕННО: демо UI-примитивов (чекпоинт 2). Удалить в конце фазы. */}
      <Route path="/ui-kit" element={<UiKitPage />} />
      <Route
        path="/play/online/:gameId"
        element={
          <RequireAuth>
            <OnlineGamePage />
          </RequireAuth>
        }
      />
      <Route
        path="/history"
        element={
          <RequireAuth>
            <GameHistoryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/history/:gameId"
        element={
          <RequireAuth>
            <GameReplayPage />
          </RequireAuth>
        }
      />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </>
  );
}
