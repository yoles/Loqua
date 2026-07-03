import { describe, expect, it } from 'vitest';

import { PronunciationError } from './errors.ts';
import { makeWord } from './word.ts';

describe('Word value object', () => {
  it('wraps a single word', () => {
    const word = makeWord('interesting');

    expect(word.text).toBe('interesting');
    expect(Object.isFrozen(word)).toBe(true);
  });

  it('keeps hyphenated and apostrophized words intact', () => {
    expect(makeWord("doesn't").text).toBe("doesn't");
    expect(makeWord('post-mortem').text).toBe('post-mortem');
  });

  it('rejects empty text or multiple words', () => {
    expect(() => makeWord('')).toThrow(PronunciationError);
    expect(() => makeWord('two words')).toThrow(PronunciationError);
  });
});
