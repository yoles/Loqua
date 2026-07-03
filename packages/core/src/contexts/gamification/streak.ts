import { GamificationError } from './errors.ts';
import { deepFreeze } from '../../shared/freeze.ts';

// Jour LOCAL au format ISO (YYYY-MM-DD) — la règle du streak vit en fuseau local (§6).
export type LocalDay = string;

const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface Streak {
  readonly days: number;
  readonly lastEarnedDay: LocalDay | null;
}

export function makeStreak(parts: { days: number; lastEarnedDay: LocalDay | null }): Streak {
  if (!Number.isInteger(parts.days) || parts.days < 0) {
    throw new GamificationError(`a streak needs a non-negative integer day count, got ${parts.days}`);
  }
  if (parts.lastEarnedDay !== null && !LOCAL_DAY_PATTERN.test(parts.lastEarnedDay)) {
    throw new GamificationError(`a local day must be YYYY-MM-DD, got "${parts.lastEarnedDay}"`);
  }
  if (parts.days > 0 && parts.lastEarnedDay === null) {
    throw new GamificationError('a positive streak needs the local day that earned it');
  }
  return deepFreeze({ days: parts.days, lastEarnedDay: parts.lastEarnedDay });
}
