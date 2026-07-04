import { z } from 'zod';

import type {
  AudioClip,
  ModelRuntimePort,
  RuntimeCapability,
  TranscriptionPort,
  TranscriptionResult,
} from '@loqua/core';
import type { TauriInvoke } from '../ipc/tauri-invoke.ts';

// STT natif (whisper.cpp côté Rust). L'audio est décodé en PCM dans la webview,
// écrit UNE fois sur disque via le canal binaire brut (store_clip), puis la
// transcription ne manipule que des ids — jamais d'octets audio en JSON (§15).
export const NATIVE_STT_MODEL_ID = 'whisper-base-en';

const transcriptionIpcSchema = z.object({
  text: z.string(),
  words: z.array(
    z.object({
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
    }),
  ),
  language: z.string(),
});

interface TauriTranscriptionOptions {
  readonly invoke: TauriInvoke;
  readonly modelRuntime: ModelRuntimePort;
  // Injecté par le composition root (le décodage WebAudio est un savoir-faire
  // du navigateur, pas de ce package).
  readonly decodeToPcm16k: (clip: AudioClip) => Promise<Float32Array>;
  readonly onDownloadProgress?: (ratio: number) => void;
}

function toPcm16Bytes(samples: Float32Array): Uint8Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    pcm[i] = Math.round(clamped * 32_767);
  }
  return new Uint8Array(pcm.buffer);
}

export function createTauriTranscriptionPort(
  options: TauriTranscriptionOptions,
): TranscriptionPort {
  const memo = new Map<string, TranscriptionResult>();

  async function ensureModel(): Promise<void> {
    const ready = await options.modelRuntime.isReady(NATIVE_STT_MODEL_ID);
    if (!ready) {
      await options.modelRuntime.download(
        NATIVE_STT_MODEL_ID,
        options.onDownloadProgress ?? (() => {}),
      );
    }
  }

  return {
    capability(): RuntimeCapability {
      return { available: true, qualityTier: 'local-basic' };
    },

    async transcribe(audio: AudioClip): Promise<TranscriptionResult> {
      const memoized = memo.get(audio.id);
      if (memoized !== undefined) {
        return memoized;
      }
      try {
        await ensureModel();
        const samples = await options.decodeToPcm16k(audio);
        await options.invoke('store_clip', toPcm16Bytes(samples), {
          headers: { 'clip-id': audio.id },
        });
        const response = await options.invoke('stt_transcribe', {
          clipId: audio.id,
          modelId: NATIVE_STT_MODEL_ID,
        });
        const result = transcriptionIpcSchema.parse(response);
        memo.set(audio.id, result);
        return result;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`native transcription failed (clip ${audio.id}): ${detail}`);
      }
    },
  };
}
