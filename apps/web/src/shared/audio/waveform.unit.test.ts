import { describe, expect, it } from 'vitest';

import { waveformBars } from './waveform';
import type { AudioClip } from '@loqua/core';

function pcmClip(samples: Float32Array): AudioClip {
  const data = new ArrayBuffer(samples.byteLength);
  new Float32Array(data).set(samples);
  return {
    id: 'w',
    format: 'pcm',
    sampleRate: 24_000,
    data,
    durationMs: 100,
  };
}

describe('waveformBars — visual amplitude reduction of a PCM clip', () => {
  it('returns the requested number of bars', () => {
    const bars = waveformBars(pcmClip(new Float32Array(2400).fill(0.2)), 24);
    expect(bars).toHaveLength(24);
  });

  it('captures the peak amplitude of each window', () => {
    const samples = new Float32Array(8);
    samples[0] = 0.1;
    samples[1] = -0.9; // pic (valeur absolue) de la 1ʳᵉ fenêtre
    samples[6] = 0.4;
    const bars = waveformBars(pcmClip(samples), 2);
    expect(bars[0]).toBeCloseTo(0.9);
    expect(bars[1]).toBeCloseTo(0.4);
  });

  it('returns no bars for an empty clip or a non-PCM clip', () => {
    expect(waveformBars(pcmClip(new Float32Array(0)))).toEqual([]);
    expect(waveformBars({ ...pcmClip(new Float32Array(8)), format: 'webm' })).toEqual([]);
  });
});
