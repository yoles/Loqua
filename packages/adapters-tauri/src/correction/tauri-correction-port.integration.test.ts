import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTauriCorrectionPort } from './tauri-correction-port.ts';
import type { TauriInvoke, TauriInvokeArgs } from '../ipc/tauri-invoke.ts';
import type { ModelRuntimePort } from '@loqua/core';

const validPayload = {
  correctedText: 'I deployed the service yesterday',
  corrections: [
    {
      original: 'I have deploy',
      fixed: 'I deployed',
      type: 'tense',
      explanation: 'Use the simple past for a finished action.',
    },
  ],
};

interface RecordedCall {
  readonly command: string;
  readonly args: TauriInvokeArgs | undefined;
}

function fakeNativeLlm(response: unknown = JSON.stringify(validPayload)): {
  invoke: TauriInvoke;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const invoke: TauriInvoke = (command, args) => {
    calls.push({ command, args });
    if (command === 'llm_correct') {
      return Promise.resolve(response);
    }
    return Promise.reject(new Error(`unknown command ${command}`));
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
  const base = readyModelRuntime();
  let ready = false;
  return {
    ...base,
    isReady: () => Promise.resolve(ready),
    download: (modelId) => {
      base.downloads.push(modelId);
      ready = true;
      return Promise.resolve();
    },
  };
}

describe('Tauri local correction adapter honours the CorrectionPort contract', () => {
  let fake: ReturnType<typeof fakeNativeLlm>;

  beforeEach(() => {
    fake = fakeNativeLlm();
  });

  it('reports an honest local-strong capability that never needs egress consent', () => {
    const port = createTauriCorrectionPort({
      invoke: fake.invoke,
      modelRuntime: readyModelRuntime(),
    });

    expect(port.capability()).toEqual({
      available: true,
      qualityTier: 'local-strong',
      requiresConsentToSendText: false,
    });
  });

  it('transcript stays on-device: it corrects without any egress guard call', async () => {
    const port = createTauriCorrectionPort({
      invoke: fake.invoke,
      modelRuntime: readyModelRuntime(),
    });

    const result = await port.correct({ text: 'I have deploy yesterday', variant: 'en-US' });

    expect(result.qualityTier).toBe('local-strong');
    expect(result.correctedText).toBe('I deployed the service yesterday');
    expect(result.corrections[0]?.type).toBe('tense');
    const call = fake.calls.find((entry) => entry.command === 'llm_correct');
    expect(call?.args).toMatchObject({ text: 'I have deploy yesterday', variant: 'en-US' });
  });

  it('downloads the model on first use, then not again', async () => {
    const modelRuntime = notReadyModelRuntime();
    const port = createTauriCorrectionPort({ invoke: fake.invoke, modelRuntime });

    await port.correct({ text: 'first', variant: 'en-US' });

    expect(modelRuntime.downloads).toHaveLength(1);
  });

  it('memoizes on hash(transcript)+variant — the same utterance is corrected once', async () => {
    const port = createTauriCorrectionPort({
      invoke: fake.invoke,
      modelRuntime: readyModelRuntime(),
    });

    const first = await port.correct({ text: 'same text', variant: 'en-US' });
    const second = await port.correct({ text: 'same text', variant: 'en-US' });

    expect(second).toEqual(first);
    expect(fake.calls.filter((entry) => entry.command === 'llm_correct')).toHaveLength(1);
  });

  it('treats a different variant as a distinct cache key', async () => {
    const port = createTauriCorrectionPort({
      invoke: fake.invoke,
      modelRuntime: readyModelRuntime(),
    });

    await port.correct({ text: 'same text', variant: 'en-US' });
    await port.correct({ text: 'same text', variant: 'en-GB' });

    expect(fake.calls.filter((entry) => entry.command === 'llm_correct')).toHaveLength(2);
  });

  it('maps a malformed JSON string from the model to a domain error, not a crash', async () => {
    const broken = fakeNativeLlm('{ this is not json');
    const port = createTauriCorrectionPort({
      invoke: broken.invoke,
      modelRuntime: readyModelRuntime(),
    });

    await expect(port.correct({ text: 'x', variant: 'en-US' })).rejects.toThrow(
      /malformed local correction/,
    );
  });

  it('repairs a recoverable malformed payload (unquoted enum + trailing comma)', async () => {
    const repairable = fakeNativeLlm(
      '{"correctedText":"I deployed it","corrections":[{"original":"I have deploy","fixed":"I deployed","type": tense,"explanation":"Simple past for a finished action."},]}',
    );
    const port = createTauriCorrectionPort({
      invoke: repairable.invoke,
      modelRuntime: readyModelRuntime(),
    });

    const result = await port.correct({ text: 'I have deploy it', variant: 'en-US' });

    expect(result.correctedText).toBe('I deployed it');
    expect(result.corrections[0]?.type).toBe('tense');
    expect(result.qualityTier).toBe('local-strong');
  });

  it('maps a schema-invalid payload (bad error type) to a domain error', async () => {
    const badType = fakeNativeLlm(
      JSON.stringify({
        correctedText: 'ok',
        corrections: [{ original: 'a', fixed: 'b', type: 'not-a-type', explanation: 'x' }],
      }),
    );
    const port = createTauriCorrectionPort({
      invoke: badType.invoke,
      modelRuntime: readyModelRuntime(),
    });

    await expect(port.correct({ text: 'x', variant: 'en-US' })).rejects.toThrow(
      /malformed local correction/,
    );
  });

  it('maps a technical inference failure (OOM) to a typed domain error', async () => {
    const failing: TauriInvoke = () => Promise.reject(new Error('llama context OOM'));
    const port = createTauriCorrectionPort({
      invoke: failing,
      modelRuntime: readyModelRuntime(),
    });

    await expect(port.correct({ text: 'x', variant: 'en-US' })).rejects.toThrow(
      /local correction failed.*llama context OOM/,
    );
  });

  it('accepts an already-correct utterance with an empty corrections list', async () => {
    const clean = fakeNativeLlm(
      JSON.stringify({ correctedText: 'This looks good', corrections: [] }),
    );
    const port = createTauriCorrectionPort({
      invoke: clean.invoke,
      modelRuntime: readyModelRuntime(),
    });

    const result = await port.correct({ text: 'This looks good', variant: 'en-US' });

    expect(result.corrections).toEqual([]);
  });

  it('forwards model download progress to the injected callback', async () => {
    const onDownloadProgress = vi.fn();
    const modelRuntime = notReadyModelRuntime();
    const withProgress: ModelRuntimePort = {
      ...modelRuntime,
      download: (modelId, onProgress) => {
        onProgress(0.5);
        onProgress(1);
        return modelRuntime.download(modelId, onProgress);
      },
    };
    const port = createTauriCorrectionPort({
      invoke: fake.invoke,
      modelRuntime: withProgress,
      onDownloadProgress,
    });

    await port.correct({ text: 'x', variant: 'en-US' });

    expect(onDownloadProgress).toHaveBeenCalledWith(0.5);
    expect(onDownloadProgress).toHaveBeenCalledWith(1);
  });
});
