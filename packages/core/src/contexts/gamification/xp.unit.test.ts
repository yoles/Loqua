import { describe, expect, it } from 'vitest';

import { GamificationError } from './errors.ts';
import { addXp, makeXp, XP_RULES, xpForCardReview, xpForSession } from './xp.ts';

describe('XP value object', () => {
  it('wraps a non-negative integer amount', () => {
    expect(makeXp(0)).toBe(0);
    expect(makeXp(150)).toBe(150);
  });

  it('rejects negative or fractional amounts', () => {
    expect(() => makeXp(-10)).toThrow(GamificationError);
    expect(() => makeXp(1.5)).toThrow(GamificationError);
  });

  it('adds amounts without mutating anything', () => {
    const base = makeXp(100);

    expect(addXp(base, makeXp(50))).toBe(150);
    expect(base).toBe(100);
  });

  it('awards the documented amount for a completed session', () => {
    expect(xpForSession()).toBe(XP_RULES.PER_SESSION);
  });

  it('awards the documented amount for a reviewed card', () => {
    expect(xpForCardReview()).toBe(XP_RULES.PER_CARD_REVIEW);
  });
});
