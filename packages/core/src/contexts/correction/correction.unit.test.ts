import { describe, expect, it } from 'vitest';

import { CorrectionError } from './errors.ts';
import { ERROR_TYPES, isErrorType } from './error-type.ts';
import { makeCorrection } from './correction.ts';

const valid = {
  original: 'I have make a deploy',
  fixed: 'I deployed',
  type: 'grammar',
  explanation: 'English uses the verb "deploy" directly.',
} as const;

describe('Correction value object', () => {
  it('builds a frozen correction from valid parts', () => {
    const correction = makeCorrection(valid);

    expect(correction.original).toBe(valid.original);
    expect(correction.fixed).toBe(valid.fixed);
    expect(correction.type).toBe('grammar');
    expect(Object.isFrozen(correction)).toBe(true);
  });

  it('accepts an optional word span and freezes it too', () => {
    const correction = makeCorrection({ ...valid, span: { startWord: 2, endWord: 4 } });

    expect(correction.span).toEqual({ startWord: 2, endWord: 4 });
    expect(Object.isFrozen(correction.span)).toBe(true);
  });

  it('rejects empty original, fixed or explanation', () => {
    expect(() => makeCorrection({ ...valid, original: ' ' })).toThrow(CorrectionError);
    expect(() => makeCorrection({ ...valid, fixed: '' })).toThrow(CorrectionError);
    expect(() => makeCorrection({ ...valid, explanation: '' })).toThrow(CorrectionError);
  });

  it('rejects an unknown error type', () => {
    expect(() => makeCorrection({ ...valid, type: 'spelling' as never })).toThrow(CorrectionError);
  });

  it('rejects an inverted or negative span', () => {
    expect(() => makeCorrection({ ...valid, span: { startWord: 4, endWord: 2 } })).toThrow(
      CorrectionError,
    );
    expect(() => makeCorrection({ ...valid, span: { startWord: -1, endWord: 2 } })).toThrow(
      CorrectionError,
    );
  });
});

describe('ErrorType taxonomy', () => {
  it('matches the eight types fixed by ARCHITECTURE §9', () => {
    expect(ERROR_TYPES).toEqual([
      'grammar',
      'syntax',
      'vocabulary',
      'idiom',
      'register',
      'word-order',
      'article',
      'tense',
    ]);
  });

  it('guards unknown values', () => {
    expect(isErrorType('grammar')).toBe(true);
    expect(isErrorType('spelling')).toBe(false);
  });
});
