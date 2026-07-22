/**
 * Ядро рейтинга: классический Elo с динамическим K-фактором. Чистые функции
 * без обращений к базе — их легко покрыть тестами и невозможно случайно
 * «испачкать» побочными эффектами.
 *
 * Формула:
 *   E_me = 1 / (1 + 10^((R_opp − R_me) / 400))
 *   Δ    = K * (S − E_me)     S = 1 победа / 0.5 ничья / 0 поражение
 *
 * Рейтинг ОДИН на все контроли времени (см. CLAUDE.md) — сюда контроль
 * времени вообще не приходит.
 */

/** Нижняя граница рейтинга: ниже не опускаемся ни при каких условиях. */
export const RATING_FLOOR = 100;

/** Окно защиты от фарма — сутки. */
export const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Мягкая защита от фарма: коэффициент затухания по числу ПРЕДЫДУЩИХ рейтинговых
 * партий с тем же соперником за последние 24 часа (см. CLAUDE.md). `priorCount`
 * — сколько таких партий уже сыграно ДО текущей. В обычной игре это никогда не
 * заметно; целенаправленный грайндинг с одним другом — глохнет.
 */
export function repeatMultiplier(priorCount: number): number {
  if (priorCount <= 2) return 1; // текущая — 1-я, 2-я или 3-я
  if (priorCount === 3) return 0.5; // 4-я
  if (priorCount === 4) return 0.25; // 5-я
  return 0; // 6-я и далее — партия играется как обычно, но рейтинг не меняется
}

/** Ожидаемый результат игрока против соперника (0..1). */
export function expectedScore(myRating: number, oppRating: number): number {
  return 1 / (1 + 10 ** ((oppRating - myRating) / 400));
}

/**
 * Динамический K-фактор — главный ответ на «сначала мало игроков»: чем выше K,
 * тем быстрее рейтинг сходится к реальной силе. Каждый игрок считает по СВОЕМУ
 * K (стандартная практика, как в FIDE) — побочный эффект — лёгкая инфляция по
 * системе, при этом масштабе несущественная.
 */
export function kFactor(rating: number, rankedGamesPlayed: number): number {
  if (rankedGamesPlayed < 10) return 60; // калибровка новичка — рейтинг скачет
  if (rankedGamesPlayed < 30) return 40;
  // 30+ партий: рейтинг «закалён».
  if (rating >= 1800) return 16; // топ — минимальный K, чтобы не штормило
  return 24;
}

export interface RatingChange {
  whiteDelta: number;
  blackDelta: number;
}

/** |x|, округлённый до целого, с исходным знаком. Math.sign(0) === 0. */
function roundSigned(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/**
 * Полный расчёт изменения рейтинга для завершившейся партии.
 *
 * `repeatMultiplier` — коэффициент затухания на повторные встречи с тем же
 * соперником (защита от фарма, см. CLAUDE.md). Применяется к Δ ДО округления и
 * ДО правила минимума ±1. Множитель 0 ⇒ рейтинг просто не меняется.
 */
export function computeRatingChange(input: {
  whiteRating: number;
  blackRating: number;
  whiteGames: number;
  blackGames: number;
  result: 'white' | 'black' | 'draw';
  repeatMultiplier: number;
}): RatingChange {
  const { whiteRating, blackRating, whiteGames, blackGames, result, repeatMultiplier } = input;

  const eWhite = expectedScore(whiteRating, blackRating);
  const eBlack = 1 - eWhite; // E_white + E_black === 1 математически
  const sWhite = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
  const sBlack = result === 'black' ? 1 : result === 'draw' ? 0.5 : 0;

  const kWhite = kFactor(whiteRating, whiteGames);
  const kBlack = kFactor(blackRating, blackGames);

  const rawWhite = kWhite * (sWhite - eWhite) * repeatMultiplier;
  const rawBlack = kBlack * (sBlack - eBlack) * repeatMultiplier;

  let whiteDelta: number;
  let blackDelta: number;
  if (kWhite === kBlack) {
    // Одинаковый K ⇒ |rawWhite| === |rawBlack|: округляем модуль ОДИН раз и
    // применяем с противоположными знаками. Иначе изредка вылезает расхождение
    // в 1 очко и система перестаёт быть zero-sum там, где обязана ею быть.
    const mag = Math.round(Math.abs(rawWhite));
    whiteDelta = Math.sign(rawWhite) * mag;
    blackDelta = Math.sign(rawBlack) * mag;
  } else {
    // Разный K ⇒ у каждого свой модуль, каждый округляется отдельно — и это
    // нормально: система в этом случае и не должна быть zero-sum.
    whiteDelta = roundSigned(rawWhite);
    blackDelta = roundSigned(rawBlack);
  }

  // Минимум ±1 за результативную партию: победа над сильно более слабым не
  // должна выглядеть как +0 (это читалось бы как баг). К ничьим НЕ применяется.
  // При множителе 0 минимума нет — рейтинг не меняется вовсе.
  if (result !== 'draw' && repeatMultiplier > 0) {
    if (result === 'white') {
      whiteDelta = Math.max(whiteDelta, 1);
      blackDelta = Math.min(blackDelta, -1);
    } else {
      blackDelta = Math.max(blackDelta, 1);
      whiteDelta = Math.min(whiteDelta, -1);
    }
  }

  // Пол рейтинга: клампим дельту по before-рейтингу, чтобы сохранённая дельта
  // совпадала с реальным изменением (rating + delta === newRating). На самом
  // полу проигрыш стоит 0 — ниже 100 не проваливаемся и не деморализуем.
  whiteDelta = Math.max(whiteDelta, RATING_FLOOR - whiteRating);
  blackDelta = Math.max(blackDelta, RATING_FLOOR - blackRating);

  // `+ 0` нормализует −0 (арифметика с множителем 0 могла его породить) в +0,
  // чтобы наружу никогда не утекал минус-ноль.
  return { whiteDelta: whiteDelta + 0, blackDelta: blackDelta + 0 };
}
