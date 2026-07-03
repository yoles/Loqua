import { describe, expect, it } from 'vitest';

import { createEgressGuard } from './egress-guard.ts';
import { createEventBus } from '../events/event-bus.ts';
import { makeConsent } from '../contexts/identity/consent.ts';
import type { RuntimeCapability } from '../ports/runtime-capability.ts';

const cloudCapability: RuntimeCapability = {
  available: true,
  qualityTier: 'cloud-native',
  requiresConsentToSendText: true,
};

const unavailableCapability: RuntimeCapability = {
  ...cloudCapability,
  available: false,
};

function consentWith(cloudTextProcessing: boolean) {
  return makeConsent({ microphone: true, cloudTextProcessing, decidedAtMs: 1 });
}

describe('egressGuard — audio never leaves, unconditionally', () => {
  it('refuses audio for every combination of consent, opt-in and capability', () => {
    for (const cloudText of [true, false]) {
      for (const cloudOptIn of [true, false]) {
        for (const capability of [cloudCapability, unavailableCapability]) {
          const guard = createEgressGuard(createEventBus(), consentWith(cloudText));

          const decision = guard.decide({ payload: { kind: 'audio' }, cloudOptIn, capability });

          expect(decision).toEqual({ allowed: false, reason: 'audio-never-leaves' });
        }
      }
    }
  });
});

describe('egressGuard — text needs consent AND opt-in AND capability', () => {
  const textPayload = { kind: 'text', purpose: 'correction' } as const;

  it('allows text only when all three conditions hold', () => {
    const guard = createEgressGuard(createEventBus(), consentWith(true));

    const decision = guard.decide({
      payload: textPayload,
      cloudOptIn: true,
      capability: cloudCapability,
    });

    expect(decision).toEqual({ allowed: true });
  });

  it.each([
    ['no consent record', null, true, cloudCapability, 'no-consent'],
    ['consent denied', consentWith(false), true, cloudCapability, 'no-consent'],
    ['opt-in off', consentWith(true), false, cloudCapability, 'not-opted-in'],
    ['adapter unavailable', consentWith(true), true, unavailableCapability, 'adapter-unavailable'],
  ] as const)('refuses text when %s', (_label, consent, cloudOptIn, capability, reason) => {
    const guard = createEgressGuard(createEventBus(), consent);

    const decision = guard.decide({ payload: textPayload, cloudOptIn, capability });

    expect(decision).toEqual({ allowed: false, reason });
  });

  it('refuses when the adapter does not declare itself as an egress adapter', () => {
    const localCapability: RuntimeCapability = {
      available: true,
      qualityTier: 'local-strong',
    };
    const guard = createEgressGuard(createEventBus(), consentWith(true));

    const decision = guard.decide({
      payload: textPayload,
      cloudOptIn: true,
      capability: localCapability,
    });

    expect(decision).toEqual({ allowed: false, reason: 'not-an-egress-adapter' });
  });
});

describe('egressGuard — reacts to ConsentChanged immediately', () => {
  const textPayload = { kind: 'text', purpose: 'correction' } as const;

  it('revocation takes effect on the next decision', () => {
    const bus = createEventBus();
    const guard = createEgressGuard(bus, consentWith(true));

    bus.publish({ kind: 'ConsentChanged', consent: consentWith(false) });
    const decision = guard.decide({
      payload: textPayload,
      cloudOptIn: true,
      capability: cloudCapability,
    });

    expect(decision).toEqual({ allowed: false, reason: 'no-consent' });
  });

  it('a granted consent received via the bus enables text egress', () => {
    const bus = createEventBus();
    const guard = createEgressGuard(bus, null);

    bus.publish({ kind: 'ConsentChanged', consent: consentWith(true) });
    const decision = guard.decide({
      payload: textPayload,
      cloudOptIn: true,
      capability: cloudCapability,
    });

    expect(decision).toEqual({ allowed: true });
  });
});
