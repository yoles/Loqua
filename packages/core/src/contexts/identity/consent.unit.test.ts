import { describe, expect, it } from 'vitest';

import { IdentityError } from './errors.ts';
import { makeConsent } from './consent.ts';

describe('Consent value object (GDPR art. 9 — biometric)', () => {
  it('records explicit microphone and cloud-text decisions with their timestamp', () => {
    const consent = makeConsent({
      microphone: true,
      cloudTextProcessing: false,
      decidedAtMs: 1_700_000_000_000,
    });

    expect(consent.microphone).toBe(true);
    expect(consent.cloudTextProcessing).toBe(false);
    expect(consent.decidedAtMs).toBe(1_700_000_000_000);
    expect(Object.isFrozen(consent)).toBe(true);
  });

  it('never invents a decision time (clock must be injected by the caller)', () => {
    expect(() =>
      makeConsent({ microphone: true, cloudTextProcessing: true, decidedAtMs: -5 }),
    ).toThrow(IdentityError);
  });
});
