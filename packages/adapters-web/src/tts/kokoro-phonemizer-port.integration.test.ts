import { describe, expect, it, vi } from 'vitest';

import { createKokoroPhonemizerPort } from './kokoro-phonemizer-port.ts';

describe('kokoro phonemizer adapter honours the PhonemizerPort contract', () => {
  it('returns the trimmed IPA for a word', async () => {
    const phonemize = vi.fn().mockResolvedValue('  ˈɪntɹəstɪŋ  ');
    const port = createKokoroPhonemizerPort({ phonemize });

    const ipa = await port.toIpa({ word: 'interesting', variant: 'en-US' });

    expect(ipa).toBe('ˈɪntɹəstɪŋ');
  });

  it('maps the variant to the eSpeak language (a = US, b = UK)', async () => {
    const phonemize = vi.fn().mockResolvedValue('x');
    const port = createKokoroPhonemizerPort({ phonemize });

    await port.toIpa({ word: 'schedule', variant: 'en-US' });
    await port.toIpa({ word: 'schedule', variant: 'en-GB' });

    expect(phonemize).toHaveBeenNthCalledWith(1, 'schedule', 'a');
    expect(phonemize).toHaveBeenNthCalledWith(2, 'schedule', 'b');
  });

  it('memoizes on word + variant — the same request phonemizes once', async () => {
    const phonemize = vi.fn().mockResolvedValue('x');
    const port = createKokoroPhonemizerPort({ phonemize });

    await port.toIpa({ word: 'deploy', variant: 'en-US' });
    await port.toIpa({ word: 'deploy', variant: 'en-US' });

    expect(phonemize).toHaveBeenCalledTimes(1);
  });

  it('reports a conservative local-basic capability', () => {
    const port = createKokoroPhonemizerPort({ phonemize: vi.fn() });

    expect(port.capability()).toEqual({ available: true, qualityTier: 'local-basic' });
  });

  it('translates a phonemizer failure into a clear error', async () => {
    const phonemize = vi.fn().mockRejectedValue(new Error('espeak missing'));
    const port = createKokoroPhonemizerPort({ phonemize });

    await expect(port.toIpa({ word: 'deploy', variant: 'en-US' })).rejects.toThrow(
      /phonemization failed.*espeak missing/i,
    );
  });
});
