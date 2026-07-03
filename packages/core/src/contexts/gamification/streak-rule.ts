import { GamificationError } from './errors.ts';
import { previousDay } from './local-day.ts';
import { makeStreak } from './streak.ts';
import { deepFreeze } from '../../shared/freeze.ts';
import type { LocalDay, Streak } from './streak.ts';

// Règle du streak (ARCHITECTURE §6) : ≥ 60 s de parole DÉTECTÉE (pas micro
// ouvert), cumul autorisé sur la journée, bascule à minuit LOCAL.
export const STREAK_RULES = {
  REQUIRED_SPOKEN_MS: 60_000,
} as const;

export interface DailyProgress {
  readonly day: LocalDay;
  readonly spokenMs: number;
}

export function freshDailyProgress(day: LocalDay): DailyProgress {
  return deepFreeze({ day, spokenMs: 0 });
}

export interface SpeechApplication {
  readonly progress: DailyProgress;
  readonly streak: Streak;
  readonly spokenMs: number;
  readonly day: LocalDay;
}

export interface SpeechOutcome {
  readonly progress: DailyProgress;
  readonly streak: Streak;
}

function extendedStreak(streak: Streak, day: LocalDay): Streak {
  if (streak.lastEarnedDay === day) {
    return streak;
  }
  const isConsecutive = streak.lastEarnedDay === previousDay(day);
  return makeStreak({
    days: isConsecutive ? streak.days + 1 : 1,
    lastEarnedDay: day,
  });
}

export function applySpeech(application: SpeechApplication): SpeechOutcome {
  if (!Number.isFinite(application.spokenMs) || application.spokenMs < 0) {
    throw new GamificationError('spoken duration must be a non-negative number of ms');
  }
  const sameDay = application.progress.day === application.day;
  const accumulatedMs = (sameDay ? application.progress.spokenMs : 0) + application.spokenMs;
  const progress = deepFreeze({ day: application.day, spokenMs: accumulatedMs });

  if (accumulatedMs < STREAK_RULES.REQUIRED_SPOKEN_MS) {
    return deepFreeze({ progress, streak: application.streak });
  }
  return deepFreeze({ progress, streak: extendedStreak(application.streak, application.day) });
}
