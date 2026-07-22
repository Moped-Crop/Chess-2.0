/**
 * Ранги ASCENT — ЕДИНЫЙ источник правды по порогам и названиям. Импортируется
 * и клиентом (бейдж рейтинга, полоска прогресса, модалка окончания партии), и,
 * при необходимости, сервером — тем же приёмом, что серверные часы берут
 * clock.ts. Двух расходящихся копий порогов быть не должно.
 *
 * Лестница привязана к самой игре (эволюции фигур — это и есть ASCENT). Старт
 * рейтинга 1000 попадает на третью ступень (Петух), чтобы было куда и падать,
 * и расти. Ранг НЕ хранится и НЕ гоняется по сети — он однозначно выводится из
 * числового рейтинга через rankFor().
 */

export interface Rank {
  id: string;
  nameRu: string;
  nameEn: string;
  /** Нижняя граница диапазона (включительно). */
  min: number;
  /** Верхняя граница (включительно) или null для самого верхнего ранга. */
  max: number | null;
}

export const RANKS: Rank[] = [
  { id: 'pawn', nameRu: 'Пешка', nameEn: 'Pawn', min: 0, max: 799 },
  { id: 'squire', nameRu: 'Оруженосец', nameEn: 'Squire', min: 800, max: 999 },
  { id: 'rooster', nameRu: 'Петух', nameEn: 'Rooster', min: 1000, max: 1199 },
  { id: 'outrider', nameRu: 'Дозорный', nameEn: 'Outrider', min: 1200, max: 1399 },
  { id: 'prelate', nameRu: 'Прелат', nameEn: 'Prelate', min: 1400, max: 1599 },
  { id: 'ram', nameRu: 'Таран', nameEn: 'Ram', min: 1600, max: 1799 },
  { id: 'phoenix', nameRu: 'Феникс', nameEn: 'Phoenix', min: 1800, max: 1999 },
  { id: 'master', nameRu: 'Магистр ASCENT', nameEn: 'ASCENT Master', min: 2000, max: null },
];

/** Ранг для данного рейтинга. Устойчив к значениям ниже/выше всех порогов. */
export function rankFor(rating: number): Rank {
  for (const r of RANKS) {
    if (r.max === null || rating <= r.max) return r;
  }
  return RANKS[RANKS.length - 1];
}

export interface RankProgress {
  /** Доля пройденного пути до следующего ранга, 0..1. */
  ratio: number;
  /** Сколько очков рейтинга осталось до следующего ранга. */
  toNext: number;
  next: Rank;
}

/**
 * Прогресс до следующего ранга. null на верхнем ранге (следующего нет — полоску
 * прогресса на нём показывать не надо).
 */
export function rankProgress(rating: number): RankProgress | null {
  const current = rankFor(rating);
  const idx = RANKS.indexOf(current);
  const next = RANKS[idx + 1];
  if (!next) return null;
  // Диапазон текущего ранга по прогрессу — [current.min, next.min).
  const span = next.min - current.min;
  const done = rating - current.min;
  const ratio = Math.max(0, Math.min(1, done / span));
  const toNext = Math.max(0, next.min - rating);
  return { ratio, toNext, next };
}
