import { describe, expect, it } from 'vitest';

import { createEarCompareScoringPort } from './ear-compare-scoring-port.ts';
import type { AudioClip } from '@loqua/core';

function clip(id: string): AudioClip {
  return { id, format: 'pcm', sampleRate: 24_000, data: new ArrayBuffer(8), durationMs: 500 };
}

describe('ear-compare scoring adapter honours the PronunciationScoringPort contract', () => {
  it('returns an unscored comparison pairing the reference and user clips', async () => {
    const port = createEarCompareScoringPort();

    const result = await port.score({
      audio: clip('user-1'),
      reference: clip('ref-1'),
      targetWord: 'interesting',
    });

    expect(result).toEqual({
      kind: 'unscored',
      referenceClipId: 'ref-1',
      userClipId: 'user-1',
    });
  });

  it('never returns a numeric score (Spike #2 NO-GO)', async () => {
    const port = createEarCompareScoringPort();

    const result = await port.score({
      audio: clip('user-1'),
      reference: clip('ref-1'),
      targetWord: 'deploy',
    });

    expect(result.kind).toBe('unscored');
    expect('overall' in result).toBe(false);
  });

  it('fails clearly when no reference clip is provided', async () => {
    const port = createEarCompareScoringPort();

    await expect(port.score({ audio: clip('user-1'), targetWord: 'deploy' })).rejects.toThrow(
      /reference clip/i,
    );
  });

  it('reports a local-basic capability', () => {
    expect(createEarCompareScoringPort().capability()).toEqual({
      available: true,
      qualityTier: 'local-basic',
    });
  });
});
