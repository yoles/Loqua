import { pipeline } from '@huggingface/transformers';
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

import { findModel, pinnedRevision } from '../models/registry.ts';
import type { WebModelEntry } from '../models/registry.ts';
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

function loadPipeline(
  model: WebModelEntry,
  device: AsrDevice,
  onProgress?: (ratio: number) => void,
): Promise<AutomaticSpeechRecognitionPipeline> {
  return pipeline('automatic-speech-recognition', model.hubId, {
    device,
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    revision: pinnedRevision(model),
    // La passe d'optimisation ORT « TransposeDQWeightsForMatMulNBits » plante sur le
    // graphe embed_tokens de ce modèle (scale manquant) — désactivée le temps que le
    // bug amont (onnxruntime-web) ou le modèle soit corrigé.
    session_options: { graphOptimizationLevel: 'disabled' },
    progress_callback: (event: ProgressEvent) => {
      if (event.status === 'progress' && typeof event.progress === 'number') {
        onProgress?.(event.progress / 100);
      }
    },
  });
}

// WebGPU annoncé disponible (Spike #1 : pas fiable sous Linux/NVIDIA) peut malgré tout
// échouer à la création de session (ex. graphe quantifié non supporté) — repli WASM
// explicite plutôt qu'un crash, la qualityTier reflète alors correctement la dégradation.
async function loadEngine(
  model: WebModelEntry,
  preferredDevice: AsrDevice,
  onProgress?: (ratio: number) => void,
): Promise<{ device: AsrDevice; transcriber: AutomaticSpeechRecognitionPipeline }> {
  try {
    return { device: preferredDevice, transcriber: await loadPipeline(model, preferredDevice, onProgress) };
  } catch (error: unknown) {
    if (preferredDevice === 'wasm') {
      throw error;
    }
    return { device: 'wasm', transcriber: await loadPipeline(model, 'wasm', onProgress) };
  }
}

export function createTransformersAsrEngineFactory(
  modelId = 'stt-whisper-base-en',
): AsrEngineFactory {
  return async (onProgress) => {
    const model = findModel(modelId);
    if (model === null) {
      throw new Error(`unknown STT model in registry: ${modelId}`);
    }

    const preferredDevice = await detectDevice();
    const { device, transcriber } = await loadEngine(model, preferredDevice, onProgress);
    // Convention Whisper : suffixe `.en` = modèle mono-langue, qui REJETTE
    // l'option `language` (réservée aux modèles multilingues).
    const isEnglishOnlyModel = model.hubId.endsWith('.en');

    return {
      device,
      engine: {
        async run(pcm16k, opts): Promise<AsrOutput> {
          // Pas de `return_timestamps` : l'export ONNX de ce modèle n'a pas les
          // cross-attentions requises. Le MVP n'utilise que `text` ; les timings
          // par mot reviendront au Sprint 5 avec un export adapté.
          const raw: unknown = await transcriber(pcm16k, {
            ...(isEnglishOnlyModel ? {} : { language: opts.language }),
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
