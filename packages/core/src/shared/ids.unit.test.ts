import { describe, expect, it } from 'vitest';

import { SharedError } from './domain-error.ts';
import { makeCardId, makeClipId, makeSessionId } from './ids.ts';

describe('branded ids', () => {
  it('accepts a non-empty id and preserves its value', () => {
    const id = makeSessionId('session-42');

    expect(id).toBe('session-42');
  });

  it('rejects an empty id with a domain error', () => {
    expect(() => makeSessionId('')).toThrow(SharedError);
    expect(() => makeCardId('   ')).toThrow(SharedError);
    expect(() => makeClipId('')).toThrow(SharedError);
  });
});
