import { beforeEach, describe, expect, it } from 'vitest';

import { createTauriTranscriptionPort } from './tauri-transcription-port.ts';
import type { TauriInvoke, TauriInvokeArgs, TauriInvokeOptions } from '../ipc/tauri-invoke.ts';
import type { AudioClip, ModelRuntimePort } from '@loqua/core';

const clip: AudioClip = {
  id: 'abc123',
  format: 'webm',
  sampleRate: 48_000,
  data: new ArrayBuffer(16),
  durationMs: 1500,
};

const nativeResult = {
  text: 'I deployed yesterday',
  words: [{ text: 'I deployed yesterday', startMs: 0, endMs: 1500 }],
  language: 'en',
};

interface RecordedCall {
  readonly command: string;
  readonly args: TauriInvokeArgs | undefined;
  readonly options: TauriInvokeOptions | undefined;
}

function fakeNativeStt(overrides?: { transcribeResponse?: unknown }): {
  invoke: TauriInvoke;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const invoke: TauriInvoke = (command, args, options) => {
    calls.push({ command, args, options });
    switch (command) {
      case 'store_clip':
        return Promise.resolve(null);
      case 'stt_transcribe':
        return Promise.resolve(overrides?.transcribeResponse ?? nativeResult);
      default:
        return Promise.reject(new Error(`unknown command ${command}`));
    }
  };
  return { invoke, calls };
}

function readyModelRuntime(): ModelRuntimePort & { downloads: string[] } {
  const downloads: string[] = [];
  return {
    downloads,
    list: () => [],
    isReady: () => Promise.resolve(true),
    download: (modelId) => {
      downloads.push(modelId);
      return Promise.resolve();
    },
    evict: () => Promise.resolve(),
  };
}

function notReadyModelRuntime(): ModelRuntimePort & { downloads: string[] } {
  const runtime = readyModelRuntime();
  let ready = false;
  return {
    ...runtime,
    isReady: () => Promise.resolve(ready),
    download: (modelId) => {
      runtime.downloads.push(modelId);
      ready = true;
      return Promise.resolve();
    },
  };
}

const decodeToPcm = () => Promise.resolve(new Float32Array([0, 0.5, -0.5, 1]));

describe('Tauri native transcription adapter honours the TranscriptionPort contract', () => {
  let fake: ReturnType<typeof fakeNativeStt>;

  beforeEach(() => {
    fake = fakeNativeStt();
  });

  it('stores the clip as raw bytes then transcribes by id only (audio never in JSON args)', async () => {
    const port = createTauriTranscriptionPort({
      invoke: fake.invoke,
      modelRuntime: readyModelRuntime(),
      decodeToPcm16k: decodeToPcm,
    });

    const result = await port.transcribe(clip);

    expect(result.text).toBe('I deployed yesterday');
    const store = fake.calls.find((call) => call.command === 'store_clip');
    expect(store?.args).toBeInstanceOf(Uint8Array);
    expect(store?.options?.headers).toEqual({ 'clip-id': 'abc123' });
    const transcribe = fake.calls.find((call) => call.command === 'stt_transcribe');
    expect(transcribe?.args).toEqual({ clipId: 'abc123', modelId: 'whisper-base-en' });
  });

  it('downloads the model first when it is not ready yet', async () => {
    const modelRuntime = notReadyModelRuntime();
    const port = createTauriTranscriptionPort({
      invoke: fake.invoke,
      modelRuntime,
      decodeToPcm16k: decodeToPcm,
    });

    await port.transcribe(clip);

    expect(modelRuntime.downloads).toEqual(['whisper-base-en']);
  });

  it('does not download when the model is already on disk', async () => {
    const modelRuntime = readyModelRuntime();
    const port = createTauriTranscriptionPort({
      invoke: fake.invoke,
      modelRuntime,
      decodeToPcm16k: decodeToPcm,
    });

    await port.transcribe(clip);

    expect(modelRuntime.downloads).toEqual([]);
  });

  it('memoizes on the clip id — the same audio is never re-transcribed', async () => {
    const port = createTauriTranscriptionPort({
      invoke: fake.invoke,
      modelRuntime: readyModelRuntime(),
      decodeToPcm16k: decodeToPcm,
    });

    const first = await port.transcribe(clip);
    const second = await port.transcribe(clip);

    expect(second).toEqual(first);
    expect(fake.calls.filter((call) => call.command === 'stt_transcribe')).toHaveLength(1);
  });

  it('maps a malformed native payload to an explicit domain error, not a crash', async () => {
    const broken = fakeNativeStt({ transcribeResponse: { nope: true } });
    const port = createTauriTranscriptionPort({
      invoke: broken.invoke,
      modelRuntime: readyModelRuntime(),
      decodeToPcm16k: decodeToPcm,
    });

    await expect(port.transcribe(clip)).rejects.toThrow(/native transcription failed/);
  });

  it('maps a technical IPC failure to a typed error the pipeline runner can treat', async () => {
    const failingInvoke: TauriInvoke = () => Promise.reject(new Error('whisper OOM'));
    const port = createTauriTranscriptionPort({
      invoke: failingInvoke,
      modelRuntime: readyModelRuntime(),
      decodeToPcm16k: decodeToPcm,
    });

    await expect(port.transcribe(clip)).rejects.toThrow(/native transcription failed.*whisper OOM/);
  });

  it('reports an honest local capability (no optimism)', () => {
    const port = createTauriTranscriptionPort({
      invoke: fake.invoke,
      modelRuntime: readyModelRuntime(),
      decodeToPcm16k: decodeToPcm,
    });

    expect(port.capability()).toEqual({ available: true, qualityTier: 'local-basic' });
  });
});
