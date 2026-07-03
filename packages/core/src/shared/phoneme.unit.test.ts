import { describe, expect, it } from 'vitest';

import { SharedError } from './domain-error.ts';
import { makePhoneme } from './phoneme.ts';

describe('Phoneme value object', () => {
  it('wraps a valid IPA symbol', () => {
    const phoneme = makePhoneme('θ');

    expect(phoneme.ipa).toBe('θ');
  });

  it('trims surrounding whitespace', () => {
    const phoneme = makePhoneme(' ɪ ');

    expect(phoneme.ipa).toBe('ɪ');
  });

  it('rejects an empty symbol with a domain error', () => {
    expect(() => makePhoneme('')).toThrow(SharedError);
    expect(() => makePhoneme('   ')).toThrow(SharedError);
  });

  it('is immutable', () => {
    const phoneme = makePhoneme('ʃ');

    expect(Object.isFrozen(phoneme)).toBe(true);
  });
});
