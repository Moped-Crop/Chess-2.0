import { useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { apiUpdateProfile, apiGetStats, type StatsResponse } from '../api/profile';
import { useT, type StrKey } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from '../components/Avatar';
import { StatsGrid } from '../components/StatsGrid';
import { RatingSummary, RankedStatsGrid } from '../components/RatingSummary';
import { Button, Card, Field } from '../components/ui';
import { errorKey } from './authShared';
import { ProfileSecurity } from './ProfileSecurity';

const AVATAR_SIZE = 256;
const AVATAR_MAX_CHARS = 270_000; // серверный лимит с запасом

/** Сжать выбранный файл до квадрата 256×256 (cover) в data-URL JPEG. */
async function fileToAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('bad image'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const g = canvas.getContext('2d')!;
    // cover: вписываем квадрат из центра исходника
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    g.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    // Пробуем нормальное качество; если великовато — сжимаем сильнее.
    for (const quality of [0.85, 0.6, 0.4]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= AVATAR_MAX_CHARS) return data;
    }
    throw new Error('too big');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Профиль: имя, аватар, рейтинг, статистика, настройки. */
export function ProfilePage() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<StrKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiGetStats(user.id)
      .then((r) => {
        if (!cancelled) setStats(r);
      })
      .catch(() => {
        /* статистика не критична для страницы */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  async function save(input: { displayName?: string; avatarBase64?: string | null }) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { user: fresh } = await apiUpdateProfile(input);
      setUser(fresh);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errorKey(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const avatarBase64 = await fileToAvatar(file);
      await save({ avatarBase64 });
    } catch {
      // Понятно, что случилось и что делать.
      setError('errAvatarFailed');
    }
  }

  return (
    <PageShell title={t('menuProfile')}>
      <Card className="profile-header">
        <div className="profile-head">
          <Avatar src={user.avatarBase64} userId={user.id} name={user.displayName} size={96} />
          <div className="profile-head-body">
            <Field
              label={t('authDisplayName')}
              value={displayName}
              maxLength={64}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <span className="profile-username">@{user.username}</span>
            <div className="profile-edit-actions">
              <Button
                variant="primary"
                disabled={busy || displayName.trim().length === 0}
                onClick={() => void save({ displayName: displayName.trim() })}
              >
                {saved ? t('savedOk') : t('saveBtn')}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                {t('avatarChange')}
              </Button>
            </div>
            {error && (
              <p className="ui-field-error" role="alert">
                {t(error)}
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => void onFile(e)}
            />
          </div>
        </div>
        {stats && (
          <div className="profile-rating">
            <RatingSummary
              rating={stats.rating}
              peakRating={stats.peakRating}
              rankedGamesPlayed={stats.ranked.gamesPlayed}
            />
          </div>
        )}
      </Card>

      <div className="profile-stats-grid">
        <Card>
          <StatsGrid stats={stats?.stats ?? null} titleKey="statsAllTitle" />
        </Card>
        <Card>
          {stats ? (
            <RankedStatsGrid ranked={stats.ranked} />
          ) : (
            <>
              <h3 className="section-title">{t('rankedStatsTitle')}</h3>
              <p className="page-loader">{t('loading')}</p>
            </>
          )}
        </Card>
      </div>

      <div className="profile-history-row">
        <Button variant="secondary" icon={History} to="/history">
          {t('historyTitle')}
        </Button>
      </div>

      <ProfileSecurity />
    </PageShell>
  );
}
