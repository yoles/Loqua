import { describe, expect, it } from 'vitest';

import { localDayOf, previousDay } from './local-day.ts';

// 2026-07-03T22:30:00Z — déjà le 4 juillet à Tokyo, encore le 3 à Paris et à UTC.
const LATE_EVENING_UTC = Date.UTC(2026, 6, 3, 22, 30);

describe('local day (streak rule: midnight in the DEVICE timezone)', () => {
  it('maps the same instant to different local days depending on the timezone', () => {
    expect(localDayOf(LATE_EVENING_UTC, 'Asia/Tokyo')).toBe('2026-07-04');
    expect(localDayOf(LATE_EVENING_UTC, 'Europe/Paris')).toBe('2026-07-04');
    expect(localDayOf(LATE_EVENING_UTC, 'UTC')).toBe('2026-07-03');
  });

  it('switches to the next day exactly at local midnight', () => {
    const beforeMidnightParis = Date.UTC(2026, 6, 3, 21, 59); // 23:59 à Paris (UTC+2)
    const afterMidnightParis = Date.UTC(2026, 6, 3, 22, 0); // 00:00 le 4 à Paris

    expect(localDayOf(beforeMidnightParis, 'Europe/Paris')).toBe('2026-07-03');
    expect(localDayOf(afterMidnightParis, 'Europe/Paris')).toBe('2026-07-04');
  });

  it('computes the previous calendar day across month and year boundaries', () => {
    expect(previousDay('2026-07-04')).toBe('2026-07-03');
    expect(previousDay('2026-07-01')).toBe('2026-06-30');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
    expect(previousDay('2024-03-01')).toBe('2024-02-29'); // année bissextile
  });
});
