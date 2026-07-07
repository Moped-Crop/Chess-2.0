import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useT, useLang } from '../i18n';
import { Brand } from '../components/Brand';

/** Аватар-кружок: картинка пользователя или инициал. */
export function Avatar({
  avatarBase64,
  name,
  size = 40,
}: {
  avatarBase64: string | null | undefined;
  name: string;
  size?: number;
}) {
  if (avatarBase64) {
    return (
      <img
        className="avatar"
        src={avatarBase64}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span className="avatar avatar-letter" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Главное меню после входа. */
export function MenuPage() {
  const t = useT();
  const lang = useLang();
  const setLang = useGameStore((s) => s.setLang);
  const uiTheme = useGameStore((s) => s.uiTheme);
  const setUiTheme = useGameStore((s) => s.setUiTheme);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  if (!user) return null;

  const items = [
    { to: '/play/local', title: t('menuLocal'), sub: t('menuLocalSub'), icon: '♟' },
    { to: '/friends?invite=1', title: t('menuOnline'), sub: t('menuOnlineSub'), icon: '⚔' },
    { to: '/friends', title: t('menuFriends'), sub: t('menuFriendsSub'), icon: '👥' },
    { to: '/profile', title: t('menuProfile'), sub: t('menuProfileSub'), icon: '★' },
  ];

  return (
    <div className="menu-page">
      <header className="topbar menu-topbar">
        <Brand />
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            role="switch"
            aria-checked={uiTheme === 'light'}
            title={uiTheme === 'dark' ? t('lightTheme') : t('darkTheme')}
            onClick={() => setUiTheme(uiTheme === 'dark' ? 'light' : 'dark')}
          >
            <span className="theme-toggle-track">
              <svg className="icon-sun" viewBox="0 0 24 24" width="13" height="13" aria-hidden>
                <circle cx="12" cy="12" r="5" fill="currentColor" />
                <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1" />
                </g>
              </svg>
              <svg className="icon-moon" viewBox="0 0 24 24" width="13" height="13" aria-hidden>
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="currentColor" />
              </svg>
              <span className="theme-toggle-knob" />
            </span>
          </button>
          <div className="segmented lang-switch">
            <button className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>
              RU
            </button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
              EN
            </button>
          </div>
        </div>
      </header>

      <div className="menu-user card">
        <Avatar avatarBase64={user.avatarBase64} name={user.displayName} size={44} />
        <div className="menu-user-info">
          <span className="menu-user-name">
            {t('menuGreeting')} {user.displayName}
          </span>
          <span className="menu-user-sub">@{user.username}</span>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => {
            void logout().then(() => navigate('/login', { replace: true }));
          }}
        >
          {t('logoutBtn')}
        </button>
      </div>

      <nav className="menu-grid">
        {items.map((it) => (
          <Link key={it.to} className="card menu-item" to={it.to}>
            <span className="menu-item-icon" aria-hidden>
              {it.icon}
            </span>
            <span className="menu-item-title">{it.title}</span>
            <span className="menu-item-sub">{it.sub}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
