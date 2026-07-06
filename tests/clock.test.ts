import { describe, it, expect } from 'vitest';
import {
  createClock,
  applyElapsed,
  flaggedColor,
  switchAfterMove,
  formatTime,
  presetById,
} from '../src/app/clock/clock';

describe('clock logic (Tech_Plan §9)', () => {
  it('createClock: none → null, fischer → both sides at base, white active', () => {
    expect(createClock(presetById('none'), 0)).toBeNull();
    const c = createClock(presetById('5+3'), 1000)!;
    expect(c.whiteMs).toBe(300_000);
    expect(c.blackMs).toBe(300_000);
    expect(c.incrementMs).toBe(3_000);
    expect(c.activeColor).toBe('white');
  });

  it('applyElapsed decrements only the active side and clamps at zero', () => {
    const c = createClock(presetById('5+3'), 0)!;
    const after = applyElapsed(c, 1500);
    expect(after.whiteMs).toBe(298_500);
    expect(after.blackMs).toBe(300_000);
    expect(after.lastTickTs).toBe(1500);

    const low = { ...c, whiteMs: 1000 };
    expect(applyElapsed(low, 5000).whiteMs).toBe(0); // не уходит ниже нуля
  });

  it('switchAfterMove settles time, adds increment, and passes the turn', () => {
    const c = createClock(presetById('5+3'), 0)!; // base 300s, inc 3s
    const after = switchAfterMove(c, 'white', 2000, false);
    expect(after.whiteMs).toBe(300_000 - 2000 + 3000); // потратил 2с, получил +3с
    expect(after.blackMs).toBe(300_000);
    expect(after.activeColor).toBe('black');
  });

  it('switchAfterMove stops the clock when the game is over', () => {
    const c = createClock(presetById('3+2'), 0)!;
    const after = switchAfterMove(c, 'black', 1000, true);
    expect(after.activeColor).toBeNull();
    expect(after.lastTickTs).toBeNull();
  });

  it('flaggedColor reports the side that ran out of time', () => {
    const c = createClock(presetById('1+0'), 0)!;
    expect(flaggedColor(c)).toBeNull();
    expect(flaggedColor({ ...c, whiteMs: 0 })).toBe('white');
    expect(flaggedColor({ ...c, blackMs: 0 })).toBe('black');
  });

  it('formatTime shows m:ss above a minute and tenths below', () => {
    expect(formatTime(305_000)).toBe('5:05');
    expect(formatTime(60_000)).toBe('1:00');
    expect(formatTime(9_400)).toBe('9.4');
    expect(formatTime(-50)).toBe('0.0');
  });
});
