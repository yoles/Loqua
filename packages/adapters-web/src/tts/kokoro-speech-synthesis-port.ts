import type { AudioClip, RuntimeCapability, SpeechSynthesisPort, Variant } from '@loqua/core';
import type { TtsDevice, TtsEngine, TtsEngineFactory } from './tts-engine.ts';

interface KokoroPortOptions {
  readonly engineFactory: TtsEngineFactory;
  readonly onDownloadProgress?: (ratio: number) => void;
}

const DEFAULT_RATE = 1;

// id de contenu déterministe (djb2 sur texte+variante+débit) : même demande =
// même clip → mémoïsation/idempotence (§10), sans hachage crypto asynchrone.
function clipId(key: string): string {
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 33) ^ key.charCodeAt(index);
  }
  return `tts-${(hash >>> 0).toString(16)}`;
}

function toPcmClip(key: string, samples: Float32Array, sampleRate: number): AudioClip {
  const data = new ArrayBuffer(samples.byteLength);
  new Float32Array(data).set(samples);
  return {
    id: clipId(key),
    format: 'pcm',
    sampleRate,
    data,
    durationMs: Math.round((samples.length / sampleRate) * 1000),
  };
}

export function createKokoroSpeechSynthesisPort(options: KokoroPortOptions): SpeechSynthesisPort {
  let enginePromise: Promise<{ engine: TtsEngine; device: TtsDevice }> | null = null;
  let confirmedDevice: TtsDevice | null = null;
  const memo = new Map<string, AudioClip>();

  function ensureEngine(): Promise<{ engine: TtsEngine; device: TtsDevice }> {
    if (enginePromise === null) {
      // Une tentative ratée ne reste pas en cache : sinon un retry ré-utiliserait
      // la même promesse rejetée pour toujours (aucune nouvelle tentative réelle).
      enginePromise = options.engineFactory(options.onDownloadProgress).catch((error: unknown) => {
        enginePromise = null;
        throw error;
      });
    }
    return enginePromise;
  }

  return {
    capability(): RuntimeCapability {
      // Pas d'optimisme : local-basic tant que WebGPU n'est pas CONFIRMÉ (Spike #1).
      return {
        available: true,
        qualityTier: confirmedDevice === 'webgpu' ? 'local-strong' : 'local-basic',
      };
    },

    async synthesize(input: { text: string; variant: Variant; rate?: number }): Promise<AudioClip> {
      const rate = input.rate ?? DEFAULT_RATE;
      const key = `${input.variant}:${rate}:${input.text}`;
      const memoized = memo.get(key);
      if (memoized !== undefined) {
        return memoized;
      }

      try {
        const { engine, device } = await ensureEngine();
        confirmedDevice = device;
        const output = await engine.run(input.text, { variant: input.variant, speed: rate });
        const clip = toPcmClip(key, output.samples, output.sampleRate);
        memo.set(key, clip);
        return clip;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`local speech synthesis failed: ${detail}`);
      }
    },
  };
}
