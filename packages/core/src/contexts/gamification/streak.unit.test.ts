import { describe, expect, it } from 'vitest';

import { GamificationError } from './errors.ts';
import { makeStreak } from './streak.ts';

describe('Streak value object', () => {
  it('holds a day count and the local day that earned it', () => {
    const streak = makeStreak({ days: 7, lastEarnedDay: '2026-07-03' });

    expect(streak.days).toBe(7);
    expect(streak.lastEarnedDay).toBe('2026-07-03');
    expect(Object.isFrozen(streak)).toBe(true);
  });

  it('accepts a zero streak (never earned)', () => {
    const streak = makeStreak({ days: 0, lastEarnedDay: null });

    expect(streak.days).toBe(0);
    expect(streak.lastEarnedDay).toBeNull();
  });

  it('rejects negative or fractional day counts', () => {
    expect(() => makeStreak({ days: -1, lastEarnedDay: null })).toThrow(GamificationError);
    expect(() => makeStreak({ days: 2.5, lastEarnedDay: null })).toThrow(GamificationError);
  });

  it('rejects a malformed local day', () => {
    expect(() => makeStreak({ days: 1, lastEarnedDay: '03/07/2026' })).toThrow(GamificationError);
    expect(() => makeStreak({ days: 1, lastEarnedDay: '' })).toThrow(GamificationError);
  });

  it('rejects a positive streak without its earning day', () => {
    expect(() => makeStreak({ days: 3, lastEarnedDay: null })).toThrow(GamificationError);
  });
});
