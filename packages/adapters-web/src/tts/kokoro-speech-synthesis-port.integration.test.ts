import { describe, expect, it, vi } from 'vitest';

import { createKokoroSpeechSynthesisPort } from './kokoro-speech-synthesis-port.ts';
import type { TtsEngine, TtsEngineFactory } from './tts-engine.ts';

function fakeEngine(overrides?: Partial<TtsEngine>): TtsEngine {
  return {
    run: vi.fn().mockResolvedValue({
      samples: new Float32Array(24_000).fill(0.1), // 1 s @ 24 kHz
      sampleRate: 24_000,
    }),
    ...overrides,
  };
}

function factoryFor(engine: TtsEngine, device: 'webgpu' | 'wasm' = 'wasm'): TtsEngineFactory {
  return vi.fn().mockResolvedValue({ engine, device });
}

describe('kokoro speech synthesis adapter honours the SpeechSynthesisPort contract', () => {
  it('synthesizes text into a local PCM AudioClip', async () => {
    const port = createKokoroSpeechSynthesisPort({ engineFactory: factoryFor(fakeEngine()) });

    const clip = await port.synthesize({ text: 'Yesterday I deployed', variant: 'en-US' });

    expect(clip.format).toBe('pcm');
    expect(clip.sampleRate).toBe(24_000);
    expect(clip.durationMs).toBe(1000);
    expect(clip.data.byteLength).toBe(24_000 * 4);
    expect(clip.id.length).toBeGreaterThan(0);
  });

  it('passes the variant and rate through to the engine as voice/speed', async () => {
    const engine = fakeEngine();
    const port = createKokoroSpeechSynthesisPort({ engineFactory: factoryFor(engine) });

    await port.synthesize({ text: 'hello', variant: 'en-GB', rate: 0.75 });

    expect(engine.run).toHaveBeenCalledWith('hello', { variant: 'en-GB', speed: 0.75 });
  });

  it('memoizes on text + variant + rate — the same request synthesizes once', async () => {
    const engine = fakeEngine();
    const port = createKokoroSpeechSynthesisPort({ engineFactory: factoryFor(engine) });

    await port.synthesize({ text: 'same', variant: 'en-US' });
    await port.synthesize({ text: 'same', variant: 'en-US' });
    await port.synthesize({ text: 'same', variant: 'en-GB' });

    expect(engine.run).toHaveBeenCalledTimes(2);
  });

  it('initializes the engine lazily and only once', async () => {
    const factory = factoryFor(fakeEngine());
    const port = createKokoroSpeechSynthesisPort({ engineFactory: factory });

    expect(factory).not.toHaveBeenCalled();
    await port.synthesize({ text: 'a', variant: 'en-US' });
    await port.synthesize({ text: 'b', variant: 'en-US' });

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('reports a conservative capability before the engine resolves', () => {
    const port = createKokoroSpeechSynthesisPort({ engineFactory: factoryFor(fakeEngine()) });

    expect(port.capability()).toEqual({ available: true, qualityTier: 'local-basic' });
  });

  it('upgrades the reported tier once WebGPU is confirmed', async () => {
    const port = createKokoroSpeechSynthesisPort({
      engineFactory: factoryFor(fakeEngine(), 'webgpu'),
    });

    await port.synthesize({ text: 'hi', variant: 'en-US' });

    expect(port.capability().qualityTier).toBe('local-strong');
  });

  it('translates an engine failure into a clear domain error', async () => {
    const failing = fakeEngine({ run: vi.fn().mockRejectedValue(new Error('OOM')) });
    const port = createKokoroSpeechSynthesisPort({ engineFactory: factoryFor(failing) });

    await expect(port.synthesize({ text: 'hi', variant: 'en-US' })).rejects.toThrow(
      /speech synthesis failed.*OOM/i,
    );
  });

  it('keeps a failed synthesis out of the memoization cache', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({ samples: new Float32Array(240).fill(0.2), sampleRate: 24_000 });
    const port = createKokoroSpeechSynthesisPort({ engineFactory: factoryFor(fakeEngine({ run })) });

    await expect(port.synthesize({ text: 'hi', variant: 'en-US' })).rejects.toThrow();
    const clip = await port.synthesize({ text: 'hi', variant: 'en-US' });

    expect(clip.format).toBe('pcm');
    expect(run).toHaveBeenCalledTimes(2);
  });
});
