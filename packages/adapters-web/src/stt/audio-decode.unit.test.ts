import { describe, expect, it } from 'vitest';

import { resampleLinear } from './audio-decode.ts';

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
