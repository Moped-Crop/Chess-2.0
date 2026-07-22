/**
 * Ядро рейтинга (Elo с динамическим K). Опорные числа сверены с промтом:
 * при K = 24 победа над равным = +12, над сильнее на 200 = +18, над слабее на
 * 200 = +6, сильнее на 400 = +22, слабее на 400 = +2.
 */

import { describe, it, expect } from 'vitest';
import {
  expectedScore,
  kFactor,
  computeRatingChange,
  repeatMultiplier,
} from '../../server/lib/rating';

/** K = 24 достигается при 30+ рейтинговых партиях и рейтинге < 1800. */
const K24 = 30;

/** Победа белых при равном K = 24, дельта белых. */
function whiteWinDelta(whiteRating: number, blackRating: number): number {
  return computeRatingChange({
    whiteRating,
    blackRating,
    whiteGames: K24,
    blackGames: K24,
    result: 'white',
    repeatMultiplier: 1,
  }).whiteDelta;
}

describe('expectedScore', () => {
  it('равные соперники → 0.5', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 10);
  });
  it('E_me + E_opp === 1', () => {
    expect(expectedScore(1200, 1000) + expectedScore(1000, 1200)).toBeCloseTo(1, 10);
  });
});

describe('kFactor — пороги', () => {
  it('< 10 партий → 60', () => {
    expect(kFactor(1000, 0)).toBe(60);
    expect(kFactor(1000, 9)).toBe(60);
  });
  it('10–29 → 40', () => {
    expect(kFactor(1000, 10)).toBe(40);
    expect(kFactor(1000, 29)).toBe(40);
  });
  it('30+ и рейтинг < 1800 → 24', () => {
    expect(kFactor(1000, 30)).toBe(24);
    expect(kFactor(1799, 30)).toBe(24);
  });
  it('рейтинг ≥ 1800 И партий ≥ 30 → 16', () => {
    expect(kFactor(1800, 30)).toBe(16);
    expect(kFactor(2100, 50)).toBe(16);
  });
  it('рейтинг ≥ 1800, но партий < 30 → всё ещё калибровка (не 16)', () => {
    expect(kFactor(1900, 29)).toBe(40);
    expect(kFactor(1900, 9)).toBe(60);
  });
});

describe('опорные числа (K = 24, победа)', () => {
  it('равные → +12', () => {
    expect(whiteWinDelta(1000, 1000)).toBe(12);
  });
  it('соперник сильнее на 200 → +18', () => {
    expect(whiteWinDelta(1000, 1200)).toBe(18);
  });
  it('соперник слабее на 200 → +6', () => {
    expect(whiteWinDelta(1200, 1000)).toBe(6);
  });
  it('соперник сильнее на 400 → +22', () => {
    expect(whiteWinDelta(1000, 1400)).toBe(22);
  });
  it('соперник слабее на 400 → +2', () => {
    expect(whiteWinDelta(1400, 1000)).toBe(2);
  });
});

describe('монотонность выигрыша по силе соперника', () => {
  it('победа над более сильным > над равным > над слабым', () => {
    const strong = whiteWinDelta(1000, 1200);
    const equal = whiteWinDelta(1000, 1000);
    const weak = whiteWinDelta(1200, 1000);
    expect(strong).toBeGreaterThan(equal);
    expect(equal).toBeGreaterThan(weak);
  });
  it('чем шире разрыв, тем сильнее расходятся числа (200 vs 400)', () => {
    expect(whiteWinDelta(1000, 1400)).toBeGreaterThan(whiteWinDelta(1000, 1200));
    expect(whiteWinDelta(1400, 1000)).toBeLessThan(whiteWinDelta(1200, 1000));
  });
});

describe('симметрия при одинаковом K', () => {
  it('выигрыш победителя = проигрышу проигравшего', () => {
    for (const [w, b] of [
      [1000, 1000],
      [1000, 1200],
      [1300, 1000],
      [1500, 1450],
    ] as const) {
      const c = computeRatingChange({
        whiteRating: w,
        blackRating: b,
        whiteGames: K24,
        blackGames: K24,
        result: 'white',
        repeatMultiplier: 1,
      });
      expect(c.whiteDelta).toBe(-c.blackDelta);
    }
  });
});

describe('минимум ±1 за результативную партию', () => {
  it('при огромном разрыве победитель всё равно +1, проигравший −1', () => {
    // Разрыв 900: ожидаемая дельта победителя ~0, но результативная партия
    // не может стоить 0. Обе стороны далеко от пола.
    const c = computeRatingChange({
      whiteRating: 1400,
      blackRating: 500,
      whiteGames: K24,
      blackGames: K24,
      result: 'white',
      repeatMultiplier: 1,
    });
    expect(c.whiteDelta).toBe(1);
    expect(c.blackDelta).toBe(-1);
  });
});

describe('пол рейтинга 100', () => {
  it('серия поражений не пробивает 100', () => {
    let rating = 250;
    let min = rating;
    for (let i = 0; i < 60; i++) {
      const { whiteDelta } = computeRatingChange({
        whiteRating: rating,
        blackRating: 400,
        whiteGames: 5, // K = 60, крупные потери
        blackGames: 100,
        result: 'black', // белые проигрывают
        repeatMultiplier: 1,
      });
      rating += whiteDelta;
      min = Math.min(min, rating);
    }
    expect(min).toBeGreaterThanOrEqual(100);
    expect(rating).toBe(100); // осел на полу
  });

  it('на самом полу проигрыш стоит 0 (не уходит в минус)', () => {
    const { whiteDelta } = computeRatingChange({
      whiteRating: 100,
      blackRating: 1000,
      whiteGames: 5,
      blackGames: 5,
      result: 'black',
      repeatMultiplier: 1,
    });
    expect(whiteDelta).toBe(0);
  });
});

describe('ничьи', () => {
  it('ничья между равными = 0 обоим (минимум ±1 не применяется)', () => {
    const c = computeRatingChange({
      whiteRating: 1000,
      blackRating: 1000,
      whiteGames: K24,
      blackGames: K24,
      result: 'draw',
      repeatMultiplier: 1,
    });
    expect(c.whiteDelta).toBe(0);
    expect(c.blackDelta).toBe(0);
  });
  it('ничья: сильному минус, слабому плюс', () => {
    const c = computeRatingChange({
      whiteRating: 1200, // сильнее
      blackRating: 1000, // слабее
      whiteGames: K24,
      blackGames: K24,
      result: 'draw',
      repeatMultiplier: 1,
    });
    expect(c.whiteDelta).toBeLessThan(0);
    expect(c.blackDelta).toBeGreaterThan(0);
  });
});

describe('множитель повторных встреч гасит серию', () => {
  it('1.0 → +12, 0.5 → +6, 0.25 → +3, 0 → 0', () => {
    const at = (m: number) =>
      computeRatingChange({
        whiteRating: 1000,
        blackRating: 1000,
        whiteGames: K24,
        blackGames: K24,
        result: 'white',
        repeatMultiplier: m,
      });
    expect(at(1).whiteDelta).toBe(12);
    expect(at(0.5).whiteDelta).toBe(6);
    expect(at(0.25).whiteDelta).toBe(3);
    // Множитель 0: минимум ±1 не действует, рейтинг не меняется вовсе.
    const zero = at(0);
    expect(zero.whiteDelta).toBe(0);
    expect(zero.blackDelta).toBe(0);
  });
});

describe('repeatMultiplier — затухание по числу предыдущих встреч за 24ч', () => {
  it('1-я/2-я/3-я → 1.0; 4-я → 0.5; 5-я → 0.25; 6-я+ → 0', () => {
    expect(repeatMultiplier(0)).toBe(1); // текущая — первая
    expect(repeatMultiplier(1)).toBe(1);
    expect(repeatMultiplier(2)).toBe(1);
    expect(repeatMultiplier(3)).toBe(0.5); // 4-я
    expect(repeatMultiplier(4)).toBe(0.25); // 5-я
    expect(repeatMultiplier(5)).toBe(0); // 6-я
    expect(repeatMultiplier(20)).toBe(0);
  });
});

describe('инфляция при разном K — ожидаемое поведение', () => {
  it('новичок получает больше, чем теряет ветеран (не zero-sum)', () => {
    // Равные по рейтингу, но новичок (K=60) выигрывает у ветерана (K=16).
    const c = computeRatingChange({
      whiteRating: 1850,
      blackRating: 1850,
      whiteGames: 3, // новичок, K = 60
      blackGames: 200, // ветеран, K = 16 (рейтинг ≥ 1800)
      result: 'white',
      repeatMultiplier: 1,
    });
    expect(c.whiteDelta).toBe(30); // 60 * 0.5
    expect(c.blackDelta).toBe(-8); // 16 * 0.5
    expect(c.whiteDelta).toBeGreaterThan(-c.blackDelta);
  });
});
