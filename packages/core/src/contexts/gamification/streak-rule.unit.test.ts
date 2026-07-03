import { describe, expect, it } from 'vitest';

import { makeStreak } from './streak.ts';
import { applySpeech, freshDailyProgress, STREAK_RULES } from './streak-rule.ts';

const MINUTE_MS = 60_000;

function noStreak() {
  return makeStreak({ days: 0, lastEarnedDay: null });
}

describe('streak rule (behavioural cases, one per rule)', () => {
  it('does not count the streak below 60 s of detected speech', () => {
    const outcome = applySpeech({
      progress: freshDailyProgress('2026-07-03'),
      streak: noStreak(),
      spokenMs: 59_000,
      day: '2026-07-03',
    });

    expect(outcome.streak.days).toBe(0);
    expect(outcome.progress.spokenMs).toBe(59_000);
  });

  it('counts the streak once 60 s are accumulated across several sessions the same day', () => {
    const first = applySpeech({
      progress: freshDailyProgress('2026-07-03'),
      streak: noStreak(),
      spokenMs: 40_000,
      day: '2026-07-03',
    });
    const second = applySpeech({ ...first, spokenMs: 20_000, day: '2026-07-03' });

    expect(first.streak.days).toBe(0);
    expect(second.streak.days).toBe(1);
    expect(second.streak.lastEarnedDay).toBe('2026-07-03');
  });

  it('extends the streak when the previous local day was earned', () => {
    const outcome = applySpeech({
      progress: freshDailyProgress('2026-07-04'),
      streak: makeStreak({ days: 3, lastEarnedDay: '2026-07-03' }),
      spokenMs: MINUTE_MS,
      day: '2026-07-04',
    });

    expect(outcome.streak.days).toBe(4);
    expect(outcome.streak.lastEarnedDay).toBe('2026-07-04');
  });

  it('restarts the streak at 1 after a missed day', () => {
    const outcome = applySpeech({
      progress: freshDailyProgress('2026-07-06'),
      streak: makeStreak({ days: 9, lastEarnedDay: '2026-07-04' }),
      spokenMs: MINUTE_MS,
      day: '2026-07-06',
    });

    expect(outcome.streak.days).toBe(1);
    expect(outcome.streak.lastEarnedDay).toBe('2026-07-06');
  });

  it('never counts the same local day twice', () => {
    const earned = applySpeech({
      progress: freshDailyProgress('2026-07-03'),
      streak: noStreak(),
      spokenMs: MINUTE_MS,
      day: '2026-07-03',
    });
    const again = applySpeech({ ...earned, spokenMs: MINUTE_MS, day: '2026-07-03' });

    expect(again.streak.days).toBe(1);
  });

  it('resets the daily accumulation when the local day changes', () => {
    const yesterday = applySpeech({
      progress: freshDailyProgress('2026-07-03'),
      streak: noStreak(),
      spokenMs: 50_000,
      day: '2026-07-03',
    });
    const today = applySpeech({ ...yesterday, spokenMs: 30_000, day: '2026-07-04' });

    expect(today.progress.day).toBe('2026-07-04');
    expect(today.progress.spokenMs).toBe(30_000);
    expect(today.streak.days).toBe(0);
  });

  it('requires exactly the documented threshold', () => {
    expect(STREAK_RULES.REQUIRED_SPOKEN_MS).toBe(MINUTE_MS);
  });

  it('rejects negative speech durations', () => {
    expect(() =>
      applySpeech({
        progress: freshDailyProgress('2026-07-03'),
        streak: noStreak(),
        spokenMs: -1,
        day: '2026-07-03',
      }),
    ).toThrow();
  });
});
