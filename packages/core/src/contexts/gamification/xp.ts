import { GamificationError } from './errors.ts';

declare const xpBrand: unique symbol;
export type Xp = number & { readonly [xpBrand]: 'xp' };

export function makeXp(amount: number): Xp {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new GamificationError(`XP must be a non-negative integer, got ${amount}`);
  }
  return amount as Xp;
}

export function addXp(base: Xp, gained: Xp): Xp {
  return makeXp(base + gained);
}

export const XP_RULES = {
  PER_SESSION: 10,
  PER_CARD_REVIEW: 2,
} as const;

export function xpForSession(): Xp {
  return makeXp(XP_RULES.PER_SESSION);
}

export function xpForCardReview(): Xp {
  return makeXp(XP_RULES.PER_CARD_REVIEW);
}
