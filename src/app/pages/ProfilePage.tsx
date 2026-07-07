import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiUpdateProfile, apiGetStats, type UserStats } from '../api/profile';
import { useT, type StrKey } from '../i18n';
import { PageShell } from './PageShell';
import { Avatar } from './MenuPage';
import { errorKey } from './authShared';

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

/** Профиль: имя, аватар, статистика. */
export function ProfilePage() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState<StrKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiGetStats(user.id)
      .then((r) => {
        if (!cancelled) setStats(r.stats);
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
      setError('errValidation');
    }
  }

  const statItems: { key: StrKey; value: number }[] = stats
    ? [
        { key: 'statWins', value: stats.wins },
        { key: 'statLosses', value: stats.losses },
        { key: 'statDraws', value: stats.draws },
        { key: 'statGames', value: stats.gamesPlayed },
      ]
    : [];

  return (
    <PageShell title={t('menuProfile')}>
      <div className="card profile-card">
        <div className="profile-main">
          <Avatar avatarBase64={user.avatarBase64} name={user.displayName} size={88} />
          <div className="profile-fields">
            <label className="field">
              <span className="field-label">{t('authDisplayName')}</span>
              <input
                className="input"
                value={displayName}
                maxLength={64}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <div className="btn-row">
              <button
                className="btn btn-primary"
                disabled={busy || displayName.trim().length === 0}
                onClick={() => void save({ displayName: displayName.trim() })}
              >
                {saved ? t('savedOk') : t('saveBtn')}
              </button>
              <button className="btn btn-subtle" disabled={busy} onClick={() => fileRef.current?.click()}>
                {t('avatarChange')}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => void onFile(e)}
            />
          </div>
        </div>
        {error && <p className="form-error">{t(error)}</p>}
        <p className="profile-username">@{user.username}</p>
      </div>

      <div className="card profile-card">
        <h3 className="section-title">{t('statsTitle')}</h3>
        <div className="stats-grid">
          {statItems.map((s) => (
            <div key={s.key} className="stat-cell">
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{t(s.key)}</span>
            </div>
          ))}
          {!stats && <p className="page-loader">{t('loading')}</p>}
        </div>
      </div>
    </PageShell>
  );
}
