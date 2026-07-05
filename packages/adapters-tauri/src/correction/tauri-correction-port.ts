import { localCorrectionPayloadSchema } from './correction-schema.ts';
import {
  CorrectionError,
  makeCorrection,
  type CorrectionPort,
  type CorrectionResult,
  type ModelRuntimePort,
  type RuntimeCapability,
  type Variant,
} from '@loqua/core';
import type { TauriInvoke } from '../ipc/tauri-invoke.ts';

// Correction 100 % locale (llama.cpp côté Rust). Le texte NE QUITTE PAS l'appareil :
// aucun egressGuard ici — le point de sortie unique ne protège que le cloud
// (invariant #2). Le tier 'local-strong' (8B) est restitué tel quel au core.
export const NATIVE_CORRECTION_MODEL_ID = 'qwen3-8b-correction';

const CAPABILITY: RuntimeCapability = {
  available: true,
  qualityTier: 'local-strong',
  requiresConsentToSendText: false,
};

// Mémoïsation sur hash(transcript)+variant (idempotence §10) — djb2, comme le cloud.
function transcriptKey(text: string, variant: Variant): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return `${variant}:${hash >>> 0}`;
}

interface TauriCorrectionOptions {
  readonly invoke: TauriInvoke;
  readonly modelRuntime: ModelRuntimePort;
  readonly onDownloadProgress?: (ratio: number) => void;
}

export function createTauriCorrectionPort(options: TauriCorrectionOptions): CorrectionPort {
  const memo = new Map<string, CorrectionResult>();

  async function ensureModel(): Promise<void> {
    const ready = await options.modelRuntime.isReady(NATIVE_CORRECTION_MODEL_ID);
    if (!ready) {
      await options.modelRuntime.download(
        NATIVE_CORRECTION_MODEL_ID,
        options.onDownloadProgress ?? (() => {}),
      );
    }
  }

  function toResult(variant: Variant, rawJson: string): CorrectionResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new CorrectionError('malformed local correction payload (invalid JSON)');
    }
    const validated = localCorrectionPayloadSchema.safeParse(parsed);
    if (!validated.success) {
      throw new CorrectionError('malformed local correction payload (schema)');
    }
    return {
      variant,
      correctedText: validated.data.correctedText,
      corrections: validated.data.corrections.map((entry) =>
        makeCorrection({
          original: entry.original,
          fixed: entry.fixed,
          type: entry.type,
          explanation: entry.explanation,
          ...(entry.span === undefined ? {} : { span: entry.span }),
        }),
      ),
      qualityTier: 'local-strong',
    };
  }

  return {
    capability(): RuntimeCapability {
      return CAPABILITY;
    },

    async correct(input: { text: string; variant: Variant }): Promise<CorrectionResult> {
      const key = transcriptKey(input.text, input.variant);
      const memoized = memo.get(key);
      if (memoized !== undefined) {
        return memoized;
      }

      let rawJson: unknown;
      try {
        await ensureModel();
        rawJson = await options.invoke('llm_correct', {
          text: input.text,
          variant: input.variant,
          modelId: NATIVE_CORRECTION_MODEL_ID,
        });
      } catch (error: unknown) {
        if (error instanceof CorrectionError) {
          throw error;
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new CorrectionError(`local correction failed: ${detail}`);
      }

      if (typeof rawJson !== 'string') {
        throw new CorrectionError('malformed local correction payload (not a string)');
      }
      const result = toResult(input.variant, rawJson);
      memo.set(key, result);
      return result;
    },
  };
}
