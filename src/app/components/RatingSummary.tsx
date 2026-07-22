/**
 * Крупный блок рейтинга (число + ранг + полоска прогресса + пик) и отдельный
 * блок статистики по рейтинговым партиям. Общие для своего профиля и для
 * read-only профиля другого игрока — разметка не дублируется.
 */

import { useLang, useT, type StrKey } from '../i18n';
import { rankFor } from '../lib/ranks';
import { RankProgressBar } from './RatingBadge';
import type { RankedStats } from '../api/players';

/** Ниже этого числа рейтинговых партий рейтинг ещё калибруется (высокий K). */
const CALIBRATION_GAMES = 10;

export function RatingSummary({
  rating,
  peakRating,
  rankedGamesPlayed,
}: {
  rating: number;
  peakRating: number;
  rankedGamesPlayed: number;
}) {
  const t = useT();
  const lang = useLang();
  const rank = rankFor(rating);
  const rankName = lang === 'en' ? rank.nameEn : rank.nameRu;
  const calibrating = rankedGamesPlayed < CALIBRATION_GAMES;
  return (
    <>
      <div className="rating-hero">
        <span className="rating-hero-num">{rating}</span>
        <div className="rating-hero-side">
          <span className={`rating-hero-rank rank-${rank.id}`}>
            {rankName}
            {calibrating && <span className="rating-hero-calib">{t('calibration')}</span>}
          </span>
          <span className="rating-hero-peak">
            {t('peakRating')}: {peakRating}
          </span>
        </div>
      </div>
      <RankProgressBar rating={rating} />
    </>
  );
}

/** Четвёрка счётчиков по рейтинговым партиям (сыграно/побед/поражений/ничьих). */
export function RankedStatsGrid({ ranked }: { ranked: RankedStats }) {
  const t = useT();
  const cells: { key: StrKey; value: number }[] = [
    { key: 'statWins', value: ranked.wins },
    { key: 'statLosses', value: ranked.losses },
    { key: 'statDraws', value: ranked.draws },
    { key: 'statGames', value: ranked.gamesPlayed },
  ];
  return (
    <>
      <h3 className="section-title">{t('rankedStatsTitle')}</h3>
      <div className="stats-grid">
        {cells.map((c) => (
          <div key={c.key} className="stat-cell">
            <span className="stat-value">{c.value}</span>
            <span className="stat-label">{t(c.key)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
