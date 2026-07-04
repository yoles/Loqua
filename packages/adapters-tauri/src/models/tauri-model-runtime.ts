import { Channel } from '@tauri-apps/api/core';
import { z } from 'zod';

import type { ModelDescriptor, ModelRuntimePort } from '@loqua/core';
import type { TauriInvoke } from '../ipc/tauri-invoke.ts';

// Registre des modèles natifs (miroir déclaratif — l'URL de download et la
// vérification du checksum vivent côté Rust, models.rs, même id/checksum).
export const TAURI_MODEL_REGISTRY: readonly ModelDescriptor[] = [
  {
    id: 'whisper-base-en',
    task: 'stt',
    sizeBytes: 147_964_211,
    checksum: 'sha256:a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002',
  },
];

const isReadySchema = z.boolean();

interface TauriModelRuntimeOptions {
  readonly invoke: TauriInvoke;
  // Injectable : le vrai Channel Tauri n'existe que dans la webview.
  readonly createProgressChannel?: (onRatio: (ratio: number) => void) => unknown;
}

function nativeModelError(command: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`native-model-failed (${command}): ${detail}`);
}

function realProgressChannel(onRatio: (ratio: number) => void): unknown {
  const channel = new Channel<number>();
  channel.onmessage = onRatio;
  return channel;
}

export function createTauriModelRuntime(options: TauriModelRuntimeOptions): ModelRuntimePort {
  const createChannel = options.createProgressChannel ?? realProgressChannel;

  return {
    list(): ModelDescriptor[] {
      return [...TAURI_MODEL_REGISTRY];
    },

    async isReady(modelId: string): Promise<boolean> {
      try {
        const response = await options.invoke('model_is_ready', { modelId });
        return isReadySchema.parse(response);
      } catch (error: unknown) {
        throw nativeModelError('model_is_ready', error);
      }
    },

    async download(modelId: string, onProgress: (ratio: number) => void): Promise<void> {
      try {
        const onProgressChannel = createChannel(onProgress);
        await options.invoke('model_download', { modelId, onProgress: onProgressChannel });
      } catch (error: unknown) {
        throw nativeModelError('model_download', error);
      }
    },

    async evict(modelId: string): Promise<void> {
      try {
        await options.invoke('model_evict', { modelId });
      } catch (error: unknown) {
        throw nativeModelError('model_evict', error);
      }
    },
  };
}
