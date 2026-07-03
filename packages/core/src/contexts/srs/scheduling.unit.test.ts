import { describe, expect, it } from 'vitest';

import { SrsError } from './errors.ts';
import {
  applyReview,
  initialScheduling,
  isDue,
  makeScheduling,
  SCHEDULING_RULES,
} from './scheduling.ts';
import type { Scheduling } from './scheduling.ts';

const DAY_MS = 86_400_000;
const NOW = 1_700_000_000_000;

function reviewChain(grades: readonly ('again' | 'hard' | 'good' | 'easy')[]): Scheduling {
  let scheduling = initialScheduling(NOW);
  let clock = NOW;
  for (const grade of grades) {
    scheduling = applyReview(scheduling, grade, clock);
    clock = scheduling.dueAtMs;
  }
  return scheduling;
}

describe('SRS scheduling (SM-2, deterministic)', () => {
  it('makes a new card due immediately', () => {
    const scheduling = initialScheduling(NOW);

    expect(isDue(scheduling, NOW)).toBe(true);
    expect(scheduling.intervalDays).toBe(0);
    expect(scheduling.repetitions).toBe(0);
    expect(scheduling.lapses).toBe(0);
    expect(scheduling.ease).toBe(SCHEDULING_RULES.INITIAL_EASE);
  });

  it('schedules the first successful review one day out', () => {
    const scheduling = applyReview(initialScheduling(NOW), 'good', NOW);

    expect(scheduling.intervalDays).toBe(1);
    expect(scheduling.dueAtMs).toBe(NOW + DAY_MS);
    expect(scheduling.repetitions).toBe(1);
  });

  it('schedules the second successful review six days out', () => {
    const scheduling = reviewChain(['good', 'good']);

    expect(scheduling.intervalDays).toBe(6);
    expect(scheduling.repetitions).toBe(2);
  });

  it('multiplies the interval by ease from the third success on', () => {
    const scheduling = reviewChain(['good', 'good', 'good']);

    expect(scheduling.intervalDays).toBe(15); // 6 × 2.5
    expect(scheduling.ease).toBe(SCHEDULING_RULES.INITIAL_EASE);
  });

  it('counts a lapse and resets repetitions on "again"', () => {
    const scheduling = applyReview(reviewChain(['good', 'good']), 'again', NOW);

    expect(scheduling.lapses).toBe(1);
    expect(scheduling.repetitions).toBe(0);
    expect(scheduling.intervalDays).toBe(SCHEDULING_RULES.LAPSE_INTERVAL_DAYS);
  });

  it('reinserts a lapsed card into the 1 → 6 progression', () => {
    const lapsed = applyReview(reviewChain(['good', 'good', 'good']), 'again', NOW);

    const first = applyReview(lapsed, 'good', NOW);
    const second = applyReview(first, 'good', first.dueAtMs);

    expect(first.intervalDays).toBe(1);
    expect(second.intervalDays).toBe(6);
  });

  it('lowers ease on "again" without ever going below the floor', () => {
    let scheduling = initialScheduling(NOW);
    for (let i = 0; i < 20; i += 1) {
      scheduling = applyReview(scheduling, 'again', NOW);
    }

    expect(scheduling.ease).toBe(SCHEDULING_RULES.MIN_EASE);
    expect(scheduling.lapses).toBe(20);
  });

  it('grows the interval more slowly on "hard" than on "good"', () => {
    const base = reviewChain(['good', 'good']);

    const afterHard = applyReview(base, 'hard', base.dueAtMs);
    const afterGood = applyReview(base, 'good', base.dueAtMs);

    expect(afterHard.intervalDays).toBeLessThan(afterGood.intervalDays);
    expect(afterHard.intervalDays).toBeGreaterThan(base.intervalDays);
    expect(afterHard.ease).toBeLessThan(base.ease);
  });

  it('applies the easy bonus and raises ease on "easy"', () => {
    const base = reviewChain(['good', 'good']);

    const afterEasy = applyReview(base, 'easy', base.dueAtMs);
    const afterGood = applyReview(base, 'good', base.dueAtMs);

    expect(afterEasy.intervalDays).toBeGreaterThan(afterGood.intervalDays);
    expect(afterEasy.ease).toBeGreaterThan(base.ease);
  });

  it('gives a first "easy" review a longer head start than a first "good"', () => {
    const easy = applyReview(initialScheduling(NOW), 'easy', NOW);
    const good = applyReview(initialScheduling(NOW), 'good', NOW);

    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
  });

  it('caps the interval at the maximum', () => {
    const scheduling = reviewChain(Array.from({ length: 12 }, () => 'easy' as const));

    expect(scheduling.intervalDays).toBe(SCHEDULING_RULES.MAX_INTERVAL_DAYS);
  });

  it('treats a card due exactly now as due', () => {
    const scheduling = applyReview(initialScheduling(NOW), 'good', NOW);

    expect(isDue(scheduling, scheduling.dueAtMs)).toBe(true);
    expect(isDue(scheduling, scheduling.dueAtMs - 1)).toBe(false);
  });

  it('returns immutable scheduling values', () => {
    const scheduling = applyReview(initialScheduling(NOW), 'good', NOW);

    expect(Object.isFrozen(scheduling)).toBe(true);
  });

  it('never mutates the scheduling it was given', () => {
    const before = initialScheduling(NOW);
    const snapshot = { ...before };

    applyReview(before, 'again', NOW);

    expect(before).toEqual(snapshot);
  });

  it('rejects a construction below the ease floor', () => {
    expect(() =>
      makeScheduling({ ease: 1.2, intervalDays: 1, repetitions: 1, lapses: 0, dueAtMs: NOW }),
    ).toThrow(SrsError);
  });

  it('rejects negative or fractional counters', () => {
    expect(() =>
      makeScheduling({ ease: 2.5, intervalDays: -1, repetitions: 0, lapses: 0, dueAtMs: NOW }),
    ).toThrow(SrsError);
    expect(() =>
      makeScheduling({ ease: 2.5, intervalDays: 1, repetitions: 0.5, lapses: 0, dueAtMs: NOW }),
    ).toThrow(SrsError);
    expect(() =>
      makeScheduling({ ease: 2.5, intervalDays: 1, repetitions: 0, lapses: -2, dueAtMs: NOW }),
    ).toThrow(SrsError);
  });
});
