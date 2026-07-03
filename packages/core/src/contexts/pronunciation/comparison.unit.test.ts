import { describe, expect, it } from 'vitest';

import { PronunciationError } from './errors.ts';
import { makeScoreResult, makeUnscoredComparison } from './comparison.ts';

describe('UnscoredComparison (ear-compare, the V1 promise)', () => {
  it('pairs the reference clip with the user clip', () => {
    const comparison = makeUnscoredComparison({
      referenceClipId: 'clip-ref',
      userClipId: 'clip-user',
    });

    expect(comparison.kind).toBe('unscored');
    expect(comparison.referenceClipId).toBe('clip-ref');
    expect(comparison.userClipId).toBe('clip-user');
    expect(Object.isFrozen(comparison)).toBe(true);
  });

  it('rejects missing clip ids', () => {
    expect(() => makeUnscoredComparison({ referenceClipId: '', userClipId: 'u' })).toThrow(
      PronunciationError,
    );
    expect(() => makeUnscoredComparison({ referenceClipId: 'r', userClipId: ' ' })).toThrow(
      PronunciationError,
    );
  });
});

describe('ScoreResult (only reachable via the supervised R&D path)', () => {
  it('builds a scored result within 0..100 bounds', () => {
    const result = makeScoreResult({
      overall: 72,
      phonemes: [{ phoneme: 'θ', score: 40 }],
    });

    expect(result.kind).toBe('scored');
    expect(result.overall).toBe(72);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.phonemes)).toBe(true);
  });

  it('rejects scores out of the 0..100 range', () => {
    expect(() => makeScoreResult({ overall: 101, phonemes: [] })).toThrow(PronunciationError);
    expect(() => makeScoreResult({ overall: -1, phonemes: [] })).toThrow(PronunciationError);
    expect(() =>
      makeScoreResult({ overall: 50, phonemes: [{ phoneme: 'ɪ', score: 150 }] }),
    ).toThrow(PronunciationError);
  });
});
