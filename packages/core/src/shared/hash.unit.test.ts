import { describe, expect, it } from 'vitest';

import { fnv1a } from './hash.ts';

describe('fnv1a content hash', () => {
  it('is deterministic for the same input', () => {
    expect(fnv1a('tense|I have make|I made')).toBe(fnv1a('tense|I have make|I made'));
  });

  it('differs for different inputs', () => {
    expect(fnv1a('tense|a|b')).not.toBe(fnv1a('tense|a|c'));
  });

  it('returns a compact hex string', () => {
    expect(fnv1a('anything')).toMatch(/^[0-9a-f]{1,8}$/);
  });
});
