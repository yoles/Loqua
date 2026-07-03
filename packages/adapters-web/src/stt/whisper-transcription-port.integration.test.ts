import { describe, expect, it, vi } from 'vitest';

import { createWhisperTranscriptionPort } from './whisper-transcription-port.ts';
import type { AsrEngine, AsrEngineFactory } from './asr-engine.ts';
import type { AudioClip } from '@loqua/core';

function pcmClip(id: string, seconds = 1, sampleRate = 16_000): AudioClip {
  const data = new Float32Array(seconds * sampleRate).fill(0.1);
  return { id, format: 'pcm', sampleRate, data: data.buffer, durationMs: seconds * 1000 };
}

function fakeEngine(overrides?: Partial<AsrEngine>): AsrEngine {
  return {
    run: vi.fn().mockResolvedValue({
      text: 'yesterday I deployed',
      chunks: [
        { text: 'yesterday', timestamp: [0, 0.48] },
        { text: 'I', timestamp: [0.5, 0.6] },
        { text: 'deployed', timestamp: [0.62, 1.1] },
      ],
    }),
    ...overrides,
  };
}

function factoryFor(engine: AsrEngine, device: 'webgpu' | 'wasm' = 'wasm'): AsrEngineFactory {
  return vi.fn().mockResolvedValue({ engine, device });
}

describe('whisper transcription adapter honours the TranscriptionPort contract', () => {
  it('transcribes a PCM clip into text plus word timings in milliseconds', async () => {
    const port = createWhisperTranscriptionPort({ engineFactory: factoryFor(fakeEngine()) });

    const result = await port.transcribe(pcmClip('clip-1'));

    expect(result.text).toBe('yesterday I deployed');
    expect(result.language).toBe('en');
    expect(result.words).toEqual([
      { text: 'yesterday', startMs: 0, endMs: 480 },
      { text: 'I', startMs: 500, endMs: 600 },
      { text: 'deployed', startMs: 620, endMs: 1100 },
    ]);
  });

  it('memoizes on AudioClip.id — same clip is never transcribed twice', async () => {
    const engine = fakeEngine();
    const port = createWhisperTranscriptionPort({ engineFactory: factoryFor(engine) });

    await port.transcribe(pcmClip('clip-1'));
    await port.transcribe(pcmClip('clip-1'));

    expect(engine.run).toHaveBeenCalledTimes(1);
  });

  it('initializes the engine lazily and only once', async () => {
    const factory = factoryFor(fakeEngine());
    const port = createWhisperTranscriptionPort({ engineFactory: factory });

    expect(factory).not.toHaveBeenCalled();
    await port.transcribe(pcmClip('a'));
    await port.transcribe(pcmClip('b'));

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('reports a conservative capability before the engine resolves', () => {
    const port = createWhisperTranscriptionPort({ engineFactory: factoryFor(fakeEngine()) });

    const capability = port.capability();

    expect(capability.available).toBe(true);
    expect(capability.qualityTier).toBe('local-basic');
    expect(capability.requiresConsentToSendText).toBeUndefined();
  });

  it('upgrades the reported tier once WebGPU is confirmed', async () => {
    const port = createWhisperTranscriptionPort({
      engineFactory: factoryFor(fakeEngine(), 'webgpu'),
    });

    await port.transcribe(pcmClip('clip-1'));

    expect(port.capability().qualityTier).toBe('local-strong');
  });

  it('translates an engine failure into a clear error', async () => {
    const failing = fakeEngine({ run: vi.fn().mockRejectedValue(new Error('OOM')) });
    const port = createWhisperTranscriptionPort({ engineFactory: factoryFor(failing) });

    await expect(port.transcribe(pcmClip('clip-1'))).rejects.toThrow(/transcription failed.*OOM/i);
  });

  it('keeps a failed clip out of the memoization cache', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({ text: 'ok', chunks: [] });
    const port = createWhisperTranscriptionPort({ engineFactory: factoryFor(fakeEngine({ run })) });

    await expect(port.transcribe(pcmClip('clip-1'))).rejects.toThrow();
    const result = await port.transcribe(pcmClip('clip-1'));

    expect(result.text).toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });
});
