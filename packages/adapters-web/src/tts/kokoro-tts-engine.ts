import { findModel } from '../models/registry.ts';
import type { WebModelEntry } from '../models/registry.ts';
import type { KokoroTTS } from 'kokoro-js';
import type { Variant } from '@loqua/core';
import type { TtsDevice, TtsEngineFactory } from './tts-engine.ts';

// Voix Kokoro par variante (préfixe `a` = accent américain, `b` = britannique).
const VOICE_BY_VARIANT: Record<Variant, 'af_heart' | 'bf_emma'> = {
  'en-US': 'af_heart',
  'en-GB': 'bf_emma',
};

type KokoroClass = typeof import('kokoro-js').KokoroTTS;

// Acquis Spike #1 : WebGPU annoncé n'est pas fiable (Linux/NVIDIA) — on tente,
// sinon repli WASM explicite (la qualityTier reflète alors la dégradation).
async function detectDevice(): Promise<TtsDevice> {
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

function loadModel(
  Kokoro: KokoroClass,
  model: WebModelEntry,
  device: TtsDevice,
  onProgress?: (ratio: number) => void,
): Promise<KokoroTTS> {
  return Kokoro.from_pretrained(model.hubId, {
    device,
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    progress_callback: (event: ProgressEvent) => {
      if (event.status === 'progress' && typeof event.progress === 'number') {
        onProgress?.(event.progress / 100);
      }
    },
  });
}

async function loadModelWithFallback(
  Kokoro: KokoroClass,
  model: WebModelEntry,
  preferredDevice: TtsDevice,
  onProgress?: (ratio: number) => void,
): Promise<{ device: TtsDevice; tts: KokoroTTS }> {
  try {
    return {
      device: preferredDevice,
      tts: await loadModel(Kokoro, model, preferredDevice, onProgress),
    };
  } catch (error: unknown) {
    if (preferredDevice === 'wasm') {
      throw error;
    }
    return { device: 'wasm', tts: await loadModel(Kokoro, model, 'wasm', onProgress) };
  }
}

export function createKokoroTtsEngineFactory(modelId = 'tts-kokoro-82m'): TtsEngineFactory {
  return async (onProgress) => {
    const model = findModel(modelId);
    if (model === null) {
      throw new Error(`unknown TTS model in registry: ${modelId}`);
    }

    // Import DYNAMIQUE : kokoro-js tire une version de @huggingface/transformers
    // (donc d'onnxruntime-node) distincte du STT — un import statique la chargerait
    // au prerender Next (Node) et ferait planter le build (conflit natif de .so).
    // Chargée seulement ici, à la 1ʳᵉ synthèse côté client (onnxruntime-web, pas de conflit).
    const { KokoroTTS } = await import('kokoro-js');

    const preferredDevice = await detectDevice();
    const { device, tts } = await loadModelWithFallback(
      KokoroTTS,
      model,
      preferredDevice,
      onProgress,
    );

    return {
      device,
      engine: {
        async run(text, opts) {
          const audio = await tts.generate(text, {
            voice: VOICE_BY_VARIANT[opts.variant],
            speed: opts.speed,
          });
          return { samples: audio.audio, sampleRate: audio.sampling_rate };
        },
      },
    };
  };
}
