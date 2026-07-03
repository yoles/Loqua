import { GamificationError } from './errors.ts';
import type { LocalDay } from './streak.ts';

// Conversions calendaires PURES : instant + fuseau en paramètres, jamais
// d'horloge ambiante (Date.now interdit — le temps vient du ClockPort).
// 'en-CA' formate nativement en ISO YYYY-MM-DD.
export function localDayOf(instantMs: number, timezone: string): LocalDay {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instantMs);
}

const DAY_MS = 86_400_000;

export function previousDay(day: LocalDay): LocalDay {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  if (year === undefined || month === undefined || dayOfMonth === undefined) {
    throw new GamificationError(`a local day must be YYYY-MM-DD, got "${day}"`);
  }
  const previousMs = Date.UTC(year, month - 1, dayOfMonth) - DAY_MS;
  return localDayOf(previousMs, 'UTC');
}
