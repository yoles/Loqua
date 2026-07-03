import { describe, expect, it } from 'vitest';

import { isVariant } from './variant.ts';

describe('Variant', () => {
  it('recognizes the supported English variants', () => {
    expect(isVariant('en-US')).toBe(true);
    expect(isVariant('en-GB')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isVariant('fr-FR')).toBe(false);
    expect(isVariant('')).toBe(false);
    expect(isVariant('en-us')).toBe(false);
  });
});
