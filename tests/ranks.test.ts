/**
 * Ранги: единый источник правды по порогам, классификация по рейтингу и
 * полоска прогресса до следующего ранга (включая границы и верхний ранг).
 */

import { describe, it, expect } from 'vitest';
import { RANKS, rankFor, rankProgress } from '../src/app/lib/ranks';

describe('RANKS — целостность лестницы', () => {
  it('8 ступеней, диапазоны стыкуются без дыр и нахлёстов', () => {
    expect(RANKS).toHaveLength(8);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].min).toBe((RANKS[i - 1].max ?? Infinity) + 1);
    }
    expect(RANKS[RANKS.length - 1].max).toBeNull(); // верхний ранг без потолка
  });
});

describe('rankFor', () => {
  it('старт 1000 — это Петух (третья ступень)', () => {
    expect(rankFor(1000).id).toBe('rooster');
  });
  it('классификация по границам', () => {
    expect(rankFor(799).id).toBe('pawn');
    expect(rankFor(800).id).toBe('squire');
    expect(rankFor(999).id).toBe('squire');
    expect(rankFor(1199).id).toBe('rooster');
    expect(rankFor(1200).id).toBe('outrider');
    expect(rankFor(1799).id).toBe('ram');
    expect(rankFor(1800).id).toBe('phoenix');
    expect(rankFor(1999).id).toBe('phoenix');
    expect(rankFor(2000).id).toBe('master');
  });
  it('устойчив к значениям ниже/выше всех порогов', () => {
    expect(rankFor(50).id).toBe('pawn');
    expect(rankFor(9999).id).toBe('master');
  });
});

describe('rankProgress', () => {
  it('на нижней границе ранга прогресс 0, до следующего — весь диапазон', () => {
    const p = rankProgress(1000)!; // начало Петуха
    expect(p.next.id).toBe('outrider');
    expect(p.ratio).toBe(0);
    expect(p.toNext).toBe(200);
  });
  it('на середине ранга прогресс ~0.5', () => {
    const p = rankProgress(1100)!;
    expect(p.ratio).toBeCloseTo(0.5, 10);
    expect(p.toNext).toBe(100);
  });
  it('у верхней кромки ранга прогресс близок к 1, остаётся 1 очко', () => {
    const p = rankProgress(1199)!;
    expect(p.ratio).toBeCloseTo(199 / 200, 10);
    expect(p.toNext).toBe(1);
  });
  it('на верхнем ранге следующего нет → null', () => {
    expect(rankProgress(2000)).toBeNull();
    expect(rankProgress(2500)).toBeNull();
  });
  it('ratio всегда в пределах 0..1', () => {
    for (let r = 100; r <= 1999; r += 37) {
      const p = rankProgress(r)!;
      expect(p.ratio).toBeGreaterThanOrEqual(0);
      expect(p.ratio).toBeLessThanOrEqual(1);
    }
  });
});
