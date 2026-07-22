/**
 * Единый бейдж рейтинга «1247 · Дозорный» (число + название ранга, цветовая
 * метка по рангу) — ОДИН компонент на всё приложение, вставляется рядом с ником
 * везде. Ранг выводится из числа через rankFor() (по сети ранг не гоняется).
 *
 * Здесь же — полоска прогресса до следующего ранга (профиль, экран поиска).
 */

import { useLang, useT } from '../i18n';
import { rankFor, rankProgress } from '../lib/ranks';

export function RatingBadge({
  rating,
  size = 'sm',
}: {
  rating: number;
  size?: 'sm' | 'lg';
}) {
  const lang = useLang();
  const rank = rankFor(rating);
  const name = lang === 'en' ? rank.nameEn : rank.nameRu;
  return (
    <span className={`rating-badge rank-${rank.id} rating-badge-${size}`}>
      <span className="rating-badge-num">{rating}</span>
      <span className="rating-badge-dot" aria-hidden>
        ·
      </span>
      <span className="rating-badge-rank">{name}</span>
    </span>
  );
}

/** Полоска прогресса до следующего ранга. На верхнем ранге не рендерится. */
export function RankProgressBar({ rating }: { rating: number }) {
  const lang = useLang();
  const t = useT();
  const p = rankProgress(rating);
  if (!p) return null;
  const nextName = lang === 'en' ? p.next.nameEn : p.next.nameRu;
  const rank = rankFor(rating);
  return (
    <div className="rank-progress">
      <div className="rank-progress-track">
        <div
          className={`rank-progress-fill rank-${rank.id}`}
          style={{ width: `${Math.round(p.ratio * 100)}%` }}
        />
      </div>
      <div className="rank-progress-label">
        <span>
          {p.toNext} {t('toNextRank')}
        </span>
        <span className="rank-progress-next">→ {nextName}</span>
      </div>
    </div>
  );
}
