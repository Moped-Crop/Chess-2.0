import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Swords,
  Trophy,
  Bot,
  Gamepad2,
  Users,
  Medal,
  GraduationCap,
  LogOut,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useChatStore, totalUnread, badgeText } from '../store/chatStore';
import { useT, useLang, type Lang, type StrKey } from '../i18n';
import { BrandMark } from '../components/Brand';
import { PlayerRatingCard } from '../components/PlayerRatingCard';
import { Card, Button, SegmentedControl, type SegOption } from '../components/ui';
import { apiGetStats } from '../api/profile';

const LANG_OPTIONS: SegOption<Lang>[] = [
  { value: 'ru', label: 'RU' },
  { value: 'en', label: 'EN' },
];

interface Section {
  to: string;
  title: StrKey;
  sub: StrKey;
  icon: LucideIcon;
  /** Число непрочитанных сообщений; 0/undefined — бейджа нет. */
  badge?: number;
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
  // Общий счётчик непрочитанного по всем беседам — держится актуальным ChatLayer.
  const unread = useChatStore((s) => totalUnread(s.conversations));

  // Рейтинг для карточки игрока; пока грузится — карточка показывает скелетон.
  const [rating, setRating] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiGetStats(user.id)
      .then((r) => {
        if (!cancelled) setRating(r.rating);
      })
      .catch(() => {
        /* рейтинг не критичен — карточка покажется и без него */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  const sections: Section[] = [
    { to: '/friends?invite=1', title: 'menuOnline', sub: 'menuOnlineSub', icon: Swords },
    { to: '/play/ranked', title: 'menuRanked', sub: 'menuRankedSub', icon: Trophy },
    { to: '/play/bot/setup', title: 'menuBot', sub: 'menuBotSub', icon: Bot },
    { to: '/play/local', title: 'menuLocal', sub: 'menuLocalSub', icon: Gamepad2 },
    { to: '/friends', title: 'menuFriends', sub: 'menuFriendsSub', icon: Users, badge: unread },
    { to: '/leaderboard', title: 'menuLeaderboard', sub: 'menuLeaderboardSub', icon: Medal },
    { to: '/how-to-play', title: 'menuHowTo', sub: 'menuHowToSub', icon: GraduationCap },
  ];

  return (
    <div className="menu">
      <header className="menu-hero">
        <div className="menu-hero-brand">
          <BrandMark size={30} className="brand-mark-lg" />
          <h1 className="menu-hero-title">
            Chess&nbsp;2<span className="brand-dot">·</span>ASCENT
          </h1>
        </div>
        <PlayerRatingCard
          userId={user.id}
          displayName={user.displayName}
          username={user.username}
          avatarSrc={user.avatarBase64}
          rating={rating}
          to="/profile"
          ariaLabel={t('openProfile')}
        />
      </header>

      <nav className="menu-sections">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.to} to={s.to} interactive className="menu-tile">
              <span className="menu-tile-icon" aria-hidden>
                <Icon size={28} strokeWidth={1.75} />
              </span>
              {!!s.badge && <span className="unread-badge menu-tile-badge">{badgeText(s.badge)}</span>}
              <span className="menu-tile-title">{t(s.title)}</span>
              <span className="menu-tile-sub">{t(s.sub)}</span>
            </Card>
          );
        })}
      </nav>

      <footer className="menu-foot">
        <SegmentedControl
          options={LANG_OPTIONS}
          value={lang}
          onChange={setLang}
          ariaLabel={t('language')}
        />
        <Button
          variant="ghost"
          size="sm"
          icon={uiTheme === 'dark' ? Sun : Moon}
          onClick={() => setUiTheme(uiTheme === 'dark' ? 'light' : 'dark')}
        >
          {uiTheme === 'dark' ? t('lightTheme') : t('darkTheme')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={LogOut}
          onClick={() => {
            void logout().then(() => navigate('/login', { replace: true }));
          }}
        >
          {t('logoutBtn')}
        </Button>
      </footer>
    </div>
  );
}
