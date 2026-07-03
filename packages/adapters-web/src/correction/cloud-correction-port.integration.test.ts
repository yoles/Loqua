import { describe, expect, it, vi } from 'vitest';

import { createCloudCorrectionPort } from './cloud-correction-port.ts';
import { CorrectionError, createEgressGuard, createEventBus, makeConsent } from '@loqua/core';

const ENDPOINT = 'http://localhost:8787/v1/correction';

function guardWith(cloudTextProcessing: boolean) {
  return createEgressGuard(
    createEventBus(),
    makeConsent({ microphone: true, cloudTextProcessing, decidedAtMs: 1 }),
  );
}

function okReply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const validPayload = {
  correctedText: 'Yesterday I deployed',
  corrections: [
    {
      original: 'I have make a deploy',
      fixed: 'I deployed',
      type: 'grammar',
      explanation: 'Use the verb "deploy" directly.',
    },
  ],
};

describe('cloud correction adapter (provider always mocked)', () => {
  it('declares itself as an egress adapter needing consent', () => {
    const port = createCloudCorrectionPort({
      endpoint: ENDPOINT,
      guard: guardWith(true),
      cloudOptIn: () => true,
      fetchFn: vi.fn(),
    });

    expect(port.capability()).toEqual({
      available: true,
      qualityTier: 'cloud-native',
      requiresConsentToSendText: true,
    });
  });

  it('sends ONLY text and variant — the guard allowed it', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply(validPayload));
    const port = createCloudCorrectionPort({
      endpoint: ENDPOINT,
      guard: guardWith(true),
      cloudOptIn: () => true,
      fetchFn,
    });

    const result = await port.correct({ text: 'Yesterday I have make a deploy', variant: 'en-US' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, { body: string }];
    expect(url).toBe(ENDPOINT);
    expect(JSON.parse(init.body)).toEqual({
      text: 'Yesterday I have make a deploy',
      variant: 'en-US',
    });
    expect(result.correctedText).toBe('Yesterday I deployed');
    expect(result.qualityTier).toBe('cloud-native');
    expect(result.corrections[0]?.type).toBe('grammar');
  });

  it('never touches the network when the guard refuses', async () => {
    const fetchFn = vi.fn();
    const port = createCloudCorrectionPort({
      endpoint: ENDPOINT,
      guard: guardWith(false), // consentement refusé
      cloudOptIn: () => true,
      fetchFn,
    });

    await expect(port.correct({ text: 'hello', variant: 'en-US' })).rejects.toThrow(
      /egress refused: no-consent/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never touches the network when the opt-in is off', async () => {
    const fetchFn = vi.fn();
    const port = createCloudCorrectionPort({
      endpoint: ENDPOINT,
      guard: guardWith(true),
      cloudOptIn: () => false,
      fetchFn,
    });

    await expect(port.correct({ text: 'hello', variant: 'en-US' })).rejects.toThrow(
      /egress refused: not-opted-in/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a malformed provider payload with a domain error', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply({ nonsense: true }));
    const port = createCloudCorrectionPort({
      endpoint: ENDPOINT,
      guard: guardWith(true),
      cloudOptIn: () => true,
      fetchFn,
    });

    await expect(port.correct({ text: 'hello', variant: 'en-US' })).rejects.toThrow(
      CorrectionError,
    );
  });

  it('rejects an HTTP failure with a domain error carrying the status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 502 }));
    const port = createCloudCorrectionPort({
      endpoint: ENDPOINT,
      guard: guardWith(true),
      cloudOptIn: () => true,
      fetchFn,
    });

    await expect(port.correct({ text: 'hello', variant: 'en-US' })).rejects.toThrow(/502/);
  });

  it('memoizes on transcript + variant — the same text is corrected once', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(okReply(validPayload)));
    const port = createCloudCorrectionPort({
      endpoint: ENDPOINT,
      guard: guardWith(true),
      cloudOptIn: () => true,
      fetchFn,
    });

    await port.correct({ text: 'same text', variant: 'en-US' });
    await port.correct({ text: 'same text', variant: 'en-US' });
    await port.correct({ text: 'same text', variant: 'en-GB' });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
