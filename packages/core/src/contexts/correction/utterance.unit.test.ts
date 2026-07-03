import { describe, expect, it } from 'vitest';

import { CorrectionError } from './errors.ts';
import { makeUtterance } from './utterance.ts';

describe('Utterance value object', () => {
  it('holds the spoken text and its variant', () => {
    const utterance = makeUtterance({ text: 'Yesterday I fixed a bug', variant: 'en-US' });

    expect(utterance.text).toBe('Yesterday I fixed a bug');
    expect(utterance.variant).toBe('en-US');
    expect(Object.isFrozen(utterance)).toBe(true);
  });

  it('rejects empty text', () => {
    expect(() => makeUtterance({ text: '  ', variant: 'en-US' })).toThrow(CorrectionError);
  });
});
