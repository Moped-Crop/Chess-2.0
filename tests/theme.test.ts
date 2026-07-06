import { describe, it, expect } from 'vitest';
import { THEMES, themeById } from '../src/app/theme';

describe('board themes', () => {
  it('has several themes with light/dark colors', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(3);
    for (const t of THEMES) {
      expect(t.light).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.dark).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('themeById falls back to the first theme for unknown ids', () => {
    expect(themeById('green').id).toBe('green');
    expect(themeById('does-not-exist')).toBe(THEMES[0]);
  });
});
