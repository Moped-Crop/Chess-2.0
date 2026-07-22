import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiGetStats, type StatsResponse } from '../api/profile';
import { connectSocket } from '../net/socket';
import { PRESETS } from '../clock/clock';
import { useT, useLang, type StrKey } from '../i18n';
import { PageShell } from './PageShell';
import { RatingSummary } from '../components/RatingSummary';

type Phase = 'idle' | 'searching';

/**
 * Экран рейтингового матча: до поиска — текущий рейтинг/ранг/прогресс и выбор
 * контролей времени; во время поиска — спиннер, счётчик ожидания и размер
 * очереди. По mm:matched уходим прямо в партию (экрана подтверждения нет).
 */
export function RankedPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  // По умолчанию отмечены ВСЕ контроли — при маленьком онлайне иначе никто ни с
  // кем не сойдётся.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(PRESETS.map((p) => p.id)));
  const [queueSize, setQueueSize] = useState(0);
  const [waitSec, setWaitSec] = useState(0);
  const [error, setError] = useState<StrKey | null>(null);

  // Актуальная фаза для обработчика disconnect (замыкание видит устаревшее).
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiGetStats(user.id)
      .then((r) => {
        if (!cancelled) setStats(r);
      })
      .catch(() => {
        /* рейтинг покажем дефолтным, если сеть подвела */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const s = connectSocket();
    const onQueued = (p: { size: number }) => {
      setPhase('searching');
      setQueueSize(p.size);
      setError(null);
    };
    const onQueueSize = (p: { size: number }) => setQueueSize(p.size);
    const onMatched = (p: { gameId: number }) => {
      navigate(`/play/online/${p.gameId}`);
    };
    const onLeft = () => setPhase('idle');
    const onError = (p: { error: string }) => {
      setPhase('idle');
      setError(p.error === 'already_in_game' ? 'rankedAlreadyInGame' : 'errUnknown');
    };
    // Рестарт сервера теряет очередь — показываем «поиск прерван», а не вечный спиннер.
    const onDisconnect = () => {
      if (phaseRef.current === 'searching') {
        setPhase('idle');
        setError('rankedAborted');
      }
    };

    s.on('mm:queued', onQueued);
    s.on('mm:queue-size', onQueueSize);
    s.on('mm:matched', onMatched);
    s.on('mm:left', onLeft);
    s.on('mm:error', onError);
    s.on('disconnect', onDisconnect);
    return () => {
      s.off('mm:queued', onQueued);
      s.off('mm:queue-size', onQueueSize);
      s.off('mm:matched', onMatched);
      s.off('mm:left', onLeft);
      s.off('mm:error', onError);
      s.off('disconnect', onDisconnect);
      // Уходя со страницы — обязательно выйти из очереди, иначе игрока выдернет
      // в партию с другого экрана.
      s.emit('mm:leave');
    };
  }, [navigate]);

  // Счётчик времени ожидания идёт только во время поиска.
  useEffect(() => {
    if (phase !== 'searching') {
      setWaitSec(0);
      return;
    }
    const id = window.setInterval(() => setWaitSec((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startSearch() {
    if (selected.size === 0) {
      setError('rankedPickAtLeastOne');
      return;
    }
    setError(null);
    connectSocket().emit('mm:join', { timeControls: [...selected] });
  }

  function cancelSearch() {
    connectSocket().emit('mm:leave');
    setPhase('idle');
  }

  const rating = stats?.rating ?? 1000;
  const waitLabel = `${Math.floor(waitSec / 60)}:${String(waitSec % 60).padStart(2, '0')}`;

  return (
    <PageShell title={t('menuRanked')}>
      {stats && (
        <div className="card profile-card">
          <RatingSummary
            rating={rating}
            peakRating={stats.peakRating}
            rankedGamesPlayed={stats.ranked.gamesPlayed}
          />
        </div>
      )}

      <div className="card profile-card">
        {phase === 'idle' ? (
          <div className="ranked-hero">
            <h3 className="section-title">{t('rankedTimeControls')}</h3>
            <div className="ranked-tc-grid">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`ranked-tc-chip ${selected.has(p.id) ? 'on' : ''}`}
                  onClick={() => toggle(p.id)}
                >
                  {selected.has(p.id) ? '✓ ' : ''}
                  {lang === 'en' ? p.labelEn : p.label}
                </button>
              ))}
            </div>
            {error && <p className="form-error">{t(error)}</p>}
            <button className="btn btn-primary btn-lg btn-block" onClick={startSearch}>
              🔍 {t('rankedFind')}
            </button>
          </div>
        ) : (
          <div className="ranked-search">
            <div className="ranked-spinner" aria-hidden />
            <span className="section-title">{t('rankedSearching')}</span>
            <span className="ranked-wait">{waitLabel}</span>
            <span className="ranked-queue-size">
              {queueSize} {t('rankedInQueue')}
            </span>
            <button className="btn btn-subtle btn-block" onClick={cancelSearch}>
              {t('rankedCancel')}
            </button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
