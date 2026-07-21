import { useT, type StrKey } from '../i18n';
import type { UserStats } from '../api/profile';

/**
 * Блок статистики (победы/поражения/ничьи/партии). Общий для своего профиля
 * и для read-only профиля другого игрока — разметка не дублируется.
 * `null` — статистика ещё грузится.
 */

const CELLS: { key: StrKey; pick: (s: UserStats) => number }[] = [
  { key: 'statWins', pick: (s) => s.wins },
  { key: 'statLosses', pick: (s) => s.losses },
  { key: 'statDraws', pick: (s) => s.draws },
  { key: 'statGames', pick: (s) => s.gamesPlayed },
];

export function StatsGrid({ stats }: { stats: UserStats | null }) {
  const t = useT();
  return (
    <>
      <h3 className="section-title">{t('statsTitle')}</h3>
      <div className="stats-grid">
        {stats &&
          CELLS.map((c) => (
            <div key={c.key} className="stat-cell">
              <span className="stat-value">{c.pick(stats)}</span>
              <span className="stat-label">{t(c.key)}</span>
            </div>
          ))}
        {!stats && <p className="page-loader">{t('loading')}</p>}
      </div>
    </>
  );
}
