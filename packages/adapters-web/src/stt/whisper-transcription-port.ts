import { decodeToPcm16k } from './audio-decode.ts';
import type { AsrDevice, AsrEngine, AsrEngineFactory } from './asr-engine.ts';
import type {
  AudioClip,
  RuntimeCapability,
  TranscriptionPort,
  TranscriptionResult,
  WordTiming,
} from '@loqua/core';

interface WhisperPortOptions {
  readonly engineFactory: AsrEngineFactory;
  readonly onDownloadProgress?: (ratio: number) => void;
}

function toWordTimings(output: {
  chunks?: readonly { text: string; timestamp: readonly [number, number | null] }[];
}): WordTiming[] {
  return (output.chunks ?? []).map((chunk) => ({
    text: chunk.text.trim(),
    startMs: Math.round(chunk.timestamp[0] * 1000),
    endMs: Math.round((chunk.timestamp[1] ?? chunk.timestamp[0]) * 1000),
  }));
}

export function createWhisperTranscriptionPort(options: WhisperPortOptions): TranscriptionPort {
  let enginePromise: Promise<{ engine: AsrEngine; device: AsrDevice }> | null = null;
  let confirmedDevice: AsrDevice | null = null;
  const memo = new Map<string, TranscriptionResult>();

  function ensureEngine(): Promise<{ engine: AsrEngine; device: AsrDevice }> {
    enginePromise ??= options.engineFactory(options.onDownloadProgress);
    return enginePromise;
  }

  return {
    capability(): RuntimeCapability {
      // Pas d'optimisme : local-basic tant que WebGPU n'est pas CONFIRMÉ (Spike #1 :
      // WebGPU navigateur non fiable sous Linux/NVIDIA, le fallback WASM est courant).
      return {
        available: true,
        qualityTier: confirmedDevice === 'webgpu' ? 'local-strong' : 'local-basic',
      };
    },

    async transcribe(audio: AudioClip, opts?: { language?: string }) {
      const memoized = memo.get(audio.id);
      if (memoized !== undefined) {
        return memoized;
      }

      const language = opts?.language ?? 'en';
      try {
        const { engine, device } = await ensureEngine();
        confirmedDevice = device;
        const pcm = await decodeToPcm16k(audio);
        const output = await engine.run(pcm, { language });
        const result: TranscriptionResult = {
          text: output.text.trim(),
          words: toWordTimings(output),
          language,
        };
        memo.set(audio.id, result);
        return result;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`local transcription failed (clip ${audio.id}): ${detail}`);
      }
    },
  };
}
