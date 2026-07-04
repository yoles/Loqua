import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeToPcm16k, resampleLinear } from './audio-decode.ts';
import type { AudioClip } from '@loqua/core';

describe('linear resampling to 16 kHz', () => {
  it('returns the same samples when already at target rate', () => {
    const input = new Float32Array([0, 0.5, 1, 0.5]);

    const output = resampleLinear(input, 16_000, 16_000);

    expect(output).toEqual(input);
  });

  it('halves the sample count from 32 kHz to 16 kHz', () => {
    const input = new Float32Array(320);

    const output = resampleLinear(input, 32_000, 16_000);

    expect(output.length).toBe(160);
  });

  it('interpolates between neighbouring samples', () => {
    const input = new Float32Array([0, 1]);

    const output = resampleLinear(input, 32_000, 16_000);

    expect(output.length).toBe(1);
    expect(output[0]).toBe(0);
  });
});

describe('browser decode failure mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps an undecodable capture to a stable audio-decode-failed error', async () => {
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        decodeAudioData(): Promise<never> {
          return Promise.reject(new Error('Unable to decode audio data'));
        }
      },
    );
    const clip: AudioClip = {
      id: 'corrupt',
      format: 'webm',
      sampleRate: 48_000,
      data: new ArrayBuffer(8),
      durationMs: 1200,
    };

    await expect(decodeToPcm16k(clip)).rejects.toThrow(/audio-decode-failed/);
  });
});
