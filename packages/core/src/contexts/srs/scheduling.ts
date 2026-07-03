import { SrsError } from './errors.ts';
import { deepFreeze } from '../../shared/freeze.ts';
import type { ReviewGrade } from './review-grade.ts';

// Décision Sprint 3 (2026-07-03) : SM-2 variante Anki (4 grades), pas FSRS —
// le core interdit toute dépendance runtime et le langage du contexte
// (Ease, Interval, Lapse) est celui de SM-2. FSRS reste substituable ici.
export const SCHEDULING_RULES = {
  INITIAL_EASE: 2.5,
  MIN_EASE: 1.3,
  EASE_PENALTY_AGAIN: 0.2,
  EASE_PENALTY_HARD: 0.15,
  EASE_BONUS_EASY: 0.15,
  FIRST_INTERVAL_DAYS: 1,
  SECOND_INTERVAL_DAYS: 6,
  FIRST_EASY_INTERVAL_DAYS: 4,
  HARD_MULTIPLIER: 1.2,
  EASY_BONUS: 1.3,
  LAPSE_INTERVAL_DAYS: 1,
  MAX_INTERVAL_DAYS: 365,
} as const;

const DAY_MS = 86_400_000;

export interface Scheduling {
  readonly ease: number;
  readonly intervalDays: number;
  readonly repetitions: number;
  readonly lapses: number;
  readonly dueAtMs: number;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function makeScheduling(parts: Scheduling): Scheduling {
  if (!Number.isFinite(parts.ease) || parts.ease < SCHEDULING_RULES.MIN_EASE) {
    throw new SrsError(`ease must be at least ${SCHEDULING_RULES.MIN_EASE}`);
  }
  if (!isNonNegativeInteger(parts.intervalDays)) {
    throw new SrsError('intervalDays must be a non-negative integer');
  }
  if (!isNonNegativeInteger(parts.repetitions) || !isNonNegativeInteger(parts.lapses)) {
    throw new SrsError('repetitions and lapses must be non-negative integers');
  }
  if (!Number.isFinite(parts.dueAtMs) || parts.dueAtMs < 0) {
    throw new SrsError('dueAtMs must be a non-negative timestamp');
  }
  return deepFreeze({
    ease: parts.ease,
    intervalDays: parts.intervalDays,
    repetitions: parts.repetitions,
    lapses: parts.lapses,
    dueAtMs: parts.dueAtMs,
  });
}

export function initialScheduling(nowMs: number): Scheduling {
  return makeScheduling({
    ease: SCHEDULING_RULES.INITIAL_EASE,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueAtMs: nowMs,
  });
}

export function isDue(scheduling: Scheduling, nowMs: number): boolean {
  return scheduling.dueAtMs <= nowMs;
}

function cappedDays(days: number): number {
  return Math.min(SCHEDULING_RULES.MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));
}

function nextIntervalDays(scheduling: Scheduling, grade: ReviewGrade): number {
  const { repetitions, intervalDays, ease } = scheduling;
  if (grade === 'again') {
    return SCHEDULING_RULES.LAPSE_INTERVAL_DAYS;
  }
  if (grade === 'hard') {
    if (repetitions === 0) {
      return SCHEDULING_RULES.FIRST_INTERVAL_DAYS;
    }
    return cappedDays(Math.max(intervalDays + 1, intervalDays * SCHEDULING_RULES.HARD_MULTIPLIER));
  }
  if (grade === 'good') {
    if (repetitions === 0) {
      return SCHEDULING_RULES.FIRST_INTERVAL_DAYS;
    }
    if (repetitions === 1) {
      return SCHEDULING_RULES.SECOND_INTERVAL_DAYS;
    }
    return cappedDays(intervalDays * ease);
  }
  if (repetitions === 0) {
    return SCHEDULING_RULES.FIRST_EASY_INTERVAL_DAYS;
  }
  return cappedDays(intervalDays * ease * SCHEDULING_RULES.EASY_BONUS);
}

function nextEase(ease: number, grade: ReviewGrade): number {
  if (grade === 'again') {
    return Math.max(SCHEDULING_RULES.MIN_EASE, ease - SCHEDULING_RULES.EASE_PENALTY_AGAIN);
  }
  if (grade === 'hard') {
    return Math.max(SCHEDULING_RULES.MIN_EASE, ease - SCHEDULING_RULES.EASE_PENALTY_HARD);
  }
  if (grade === 'easy') {
    return ease + SCHEDULING_RULES.EASE_BONUS_EASY;
  }
  return ease;
}

export function applyReview(
  scheduling: Scheduling,
  grade: ReviewGrade,
  nowMs: number,
): Scheduling {
  const intervalDays = nextIntervalDays(scheduling, grade);
  return makeScheduling({
    ease: nextEase(scheduling.ease, grade),
    intervalDays,
    repetitions: grade === 'again' ? 0 : scheduling.repetitions + 1,
    lapses: grade === 'again' ? scheduling.lapses + 1 : scheduling.lapses,
    dueAtMs: nowMs + intervalDays * DAY_MS,
  });
}
