import { pipeline } from '@huggingface/transformers';

import { findModel } from '../models/registry.ts';
import type { AsrDevice, AsrEngineFactory, AsrOutput } from './asr-engine.ts';

// Acquis Spike #1 : WebGPU → fp32 uniquement (q8 cassé sur WebGPU) ;
// WASM → q8 (0,29× temps réel, suffisant pour la boucle async).
async function detectDevice(): Promise<AsrDevice> {
  if (typeof navigator !== 'undefined' && navigator.gpu !== undefined) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter !== null) {
        return 'webgpu';
      }
    } catch {
      // WebGPU annoncé mais inutilisable (sandbox, driver) — repli WASM.
    }
  }
  return 'wasm';
}

interface ProgressEvent {
  readonly status: string;
  readonly progress?: number;
}

export function createTransformersAsrEngineFactory(
  modelId = 'stt-whisper-base-en',
): AsrEngineFactory {
  return async (onProgress) => {
    const model = findModel(modelId);
    if (model === null) {
      throw new Error(`unknown STT model in registry: ${modelId}`);
    }

    const device = await detectDevice();
    const transcriber = await pipeline('automatic-speech-recognition', model.hubId, {
      device,
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: (event: ProgressEvent) => {
        if (event.status === 'progress' && typeof event.progress === 'number') {
          onProgress?.(event.progress / 100);
        }
      },
    });

    return {
      device,
      engine: {
        async run(pcm16k, opts): Promise<AsrOutput> {
          const raw: unknown = await transcriber(pcm16k, {
            language: opts.language,
            return_timestamps: 'word',
            chunk_length_s: 30,
          });
          const single = Array.isArray(raw) ? raw[0] : raw;
          if (
            typeof single !== 'object' ||
            single === null ||
            typeof (single as { text?: unknown }).text !== 'string'
          ) {
            throw new Error('unexpected ASR output shape');
          }
          return single as AsrOutput;
        },
      },
    };
  };
}
