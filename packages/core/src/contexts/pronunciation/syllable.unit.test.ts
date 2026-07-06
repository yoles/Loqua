import { describe, expect, it } from 'vitest';

import { syllabify } from './syllable.ts';

describe('syllabify — heuristic spelled-syllable breakdown', () => {
  it('returns no syllables for an empty or non-alphabetic input', () => {
    expect(syllabify('')).toEqual([]);
    expect(syllabify('123!')).toEqual([]);
  });

  it('keeps a single-vowel-group word as one syllable', () => {
    expect(syllabify('cat')).toEqual(['cat']);
    expect(syllabify('deploy'.slice(0, 3))).toEqual(['dep']);
  });

  it('treats a silent final "e" as part of the previous syllable', () => {
    expect(syllabify('code')).toEqual(['code']);
    expect(syllabify('service')).toEqual(['ser', 'vice']);
  });

  it('splits a multi-syllable word (PRD example: interesting)', () => {
    expect(syllabify('interesting')).toEqual(['in', 'ter', 'es', 'ting']);
  });

  it('never loses or reorders letters — joining rebuilds the cleaned word', () => {
    for (const word of ['production', 'yesterday', 'deployed', 'rollback', 'incident']) {
      expect(syllabify(word).join('')).toBe(word);
    }
  });

  it('strips punctuation and casing before splitting', () => {
    expect(syllabify("Don't")).toEqual(syllabify('dont'));
    expect(syllabify('CODE')).toEqual(['code']);
  });
});
