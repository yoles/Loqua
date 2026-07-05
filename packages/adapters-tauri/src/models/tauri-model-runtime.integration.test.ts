import { describe, expect, it, vi } from 'vitest';

import { createTauriModelRuntime } from './tauri-model-runtime.ts';
import type { TauriInvoke } from '../ipc/tauri-invoke.ts';

const descriptor = {
  id: 'whisper-base-en',
  task: 'stt',
  sizeBytes: 147_964_211,
  checksum: 'sha256:a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002',
};

describe('Tauri model runtime adapter honours the ModelRuntimePort contract', () => {
  it('lists the declared native model registry (list is synchronous, §9)', () => {
    const invoke: TauriInvoke = () => Promise.reject(new Error('list never touches IPC'));
    const runtime = createTauriModelRuntime({ invoke });

    const listed = runtime.list();
    expect(listed).toContainEqual(descriptor);
    expect(listed.some((entry) => entry.id === 'qwen3-8b-correction' && entry.task === 'llm')).toBe(
      true,
    );
  });

  it('reports readiness from the native side', async () => {
    const invoke: TauriInvoke = (command, args) => {
      expect(command).toBe('model_is_ready');
      expect(args).toEqual({ modelId: 'whisper-base-en' });
      return Promise.resolve(true);
    };
    const runtime = createTauriModelRuntime({ invoke });

    expect(await runtime.isReady('whisper-base-en')).toBe(true);
  });

  it('downloads with progress reported through the injected channel', async () => {
    const ratios: number[] = [];
    let emit: ((ratio: number) => void) | null = null;
    const invoke: TauriInvoke = (command, args) => {
      expect(command).toBe('model_download');
      expect((args as Record<string, unknown>)['modelId']).toBe('whisper-base-en');
      emit?.(0.5);
      emit?.(1);
      return Promise.resolve(null);
    };
    const runtime = createTauriModelRuntime({
      invoke,
      createProgressChannel: (onRatio) => {
        emit = onRatio;
        return 'fake-channel';
      },
    });

    await runtime.download('whisper-base-en', (ratio) => ratios.push(ratio));

    expect(ratios).toEqual([0.5, 1]);
  });

  it('maps a malformed IPC response to an explicit domain error', async () => {
    const invoke: TauriInvoke = () => Promise.resolve('not-a-boolean');
    const runtime = createTauriModelRuntime({ invoke });

    await expect(runtime.isReady('whisper-base-en')).rejects.toThrow(/native-model-failed/);
  });

  it('maps a technical failure (download aborted) to a typed domain error', async () => {
    const invoke: TauriInvoke = () => Promise.reject(new Error('checksum mismatch'));
    const runtime = createTauriModelRuntime({ invoke, createProgressChannel: () => 'fake' });

    await expect(runtime.download('whisper-base-en', vi.fn())).rejects.toThrow(
      /native-model-failed.*checksum mismatch/,
    );
  });
});
